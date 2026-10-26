import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';
import { migrate, pool } from './pg';
import { db, error, json, type HttpResult } from '@appdeploy/sdk';
import { handler } from '../backend/index';

if (existsSync('.env')) process.loadEnvFile('.env');

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const SESSION_MS = 7 * 24 * 3600 * 1000;
const MIN_PASSWORD = 8;

interface UserRow { id: string; email: string; name: string; salt: string; hash: string }

// Everything is read from Postgres on each request so it works across serverless instances.
const upsertUser = (u: UserRow) => pool().query(
  `INSERT INTO auth_users (id, email, name, salt, hash) VALUES ($1,$2,$3,$4,$5)
   ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, salt = EXCLUDED.salt, hash = EXCLUDED.hash`,
  [u.id, u.email, u.name, u.salt, u.hash],
);
const dropSession = (token: string) => pool().query('DELETE FROM auth_sessions WHERE token = $1', [token]);

const normEmail = (e: unknown) => String(e || '').trim().toLowerCase();
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const findUser = async (email: string): Promise<UserRow | undefined> =>
  (await pool().query('SELECT id, email, name, salt, hash FROM auth_users WHERE email = $1', [email])).rows[0];

async function hashPassword(password: string, saltHex = randomBytes(16).toString('hex')) {
  return { salt: saltHex, hash: (await scrypt(password, Buffer.from(saltHex, 'hex'), 64)).toString('hex') };
}

async function verifyPassword(user: UserRow | undefined, password: string) {
  const { hash } = await hashPassword(password, user?.salt ?? '00'.repeat(16));
  if (!user) return false;
  return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.hash, 'hex'));
}

async function createUser(email: string, password: string, name = '') {
  const user: UserRow = { id: randomUUID(), email, name: name || email, ...(await hashPassword(password)) };
  await upsertUser(user);
  return user;
}

async function deleteUser(userId: string) {
  await pool().query('DELETE FROM auth_users WHERE id = $1', [userId]);
}

async function issueToken(userId: string) {
  const token = randomBytes(32).toString('hex');
  await pool().query('INSERT INTO auth_sessions (token, user_id, expires_at) VALUES ($1,$2,$3)', [token, userId, Date.now() + SESSION_MS]);
  return token;
}

async function sessionUser(req: IncomingMessage) {
  const m = /^Bearer\s+(\w+)$/i.exec(String(req.headers.authorization || ''));
  if (!m) return undefined;
  const { rows } = await pool().query(
    `SELECT s.token, s.expires_at, u.id, u.email, u.name FROM auth_sessions s JOIN auth_users u ON u.id = s.user_id WHERE s.token = $1`,
    [m[1]],
  );
  const r = rows[0];
  if (!r) return undefined;
  if (Number(r.expires_at) < Date.now()) { await dropSession(m[1]); return undefined; }
  return { token: m[1], userId: r.id as string, email: r.email as string, name: r.name as string };
}

const failures = new Map<string, { count: number; until: number }>();
function throttled(key: string) {
  const f = failures.get(key);
  return !!f && f.until > Date.now();
}
function recordFailure(key: string) {
  const f = failures.get(key) ?? { count: 0, until: 0 };
  f.count += 1;
  if (f.count >= 5) { f.until = Date.now() + 10 * 60 * 1000; f.count = 0; }
  failures.set(key, f);
}

async function seedSuperAdmin() {
  const email = normEmail(process.env.SUPER_ADMIN_EMAIL);
  const password = process.env.SUPER_ADMIN_PASSWORD || '';
  if (!email || !password) { console.warn('SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD not set: no Super Admin seeded.'); return; }
  if (password.length < MIN_PASSWORD) throw new Error('SUPER_ADMIN_PASSWORD must be at least 8 characters');
  const name = process.env.SUPER_ADMIN_NAME || 'Super Admin';

  let user = await findUser(email);
  if (!user) user = await createUser(email, password, name);
  else if (!(await verifyPassword(user, password))) { Object.assign(user, await hashPassword(password)); await upsertUser(user); }

  const { items } = await db.list<any>('admins', { filter: { email }, limit: 1 });
  const record = { userId: user.id, email, name: user.name, status: 'active', isSuperAdmin: true, canEdit: true, canManageAdmins: true };
  if (items[0]) await db.update('admins', [{ id: items[0].id, record }]);
  else await db.add('admins', [record]);
}

let ready: Promise<void> | undefined;
export function init() {
  ready ??= (async () => { await migrate(); await seedSuperAdmin(); })().catch((e) => { ready = undefined; throw e; });
  return ready;
}

async function readBody(req: IncomingMessage) {
  const pre = (req as any).body;
  if (pre !== undefined && pre !== null && typeof pre === 'object' && !Buffer.isBuffer(pre)) return pre;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 2_000_000) throw new Error('Payload too large');
    chunks.push(c as Buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

async function authRoute(path: string, body: any, ip: string, req: IncomingMessage): Promise<HttpResult | null> {
  if (path === '/api/auth/login') {
    const email = normEmail(body.email);
    const key = `${ip}|${email}`;
    if (throttled(key)) return error('Too many failed attempts. Please try again in 10 minutes.', 429);
    const user = await findUser(email);
    if (!(await verifyPassword(user, String(body.password || '')))) { recordFailure(key); return error('Invalid email or password.', 401); }
    failures.delete(key);
    return json({ token: await issueToken(user!.id), user: { email: user!.email, name: user!.name } });
  }

  if (path === '/api/auth/register') {
    const email = normEmail(body.email);
    const password = String(body.password || '');
    if (!validEmail(email)) return error('Enter a valid email address.', 400);
    if (password.length < MIN_PASSWORD) return error(`Password must be at least ${MIN_PASSWORD} characters.`, 400);
    if (await findUser(email)) return error('An account with this email already exists.', 409);
    // Invited admin emails are reserved so nobody can claim an invitation by registering first.
    const { items } = await db.list<any>('admins', { filter: { email }, limit: 1 });
    if (items.length > 0) return error('This email belongs to an administrator. Sign in with the password your Super Admin gave you.', 403);
    const user = await createUser(email, password);
    return json({ token: await issueToken(user.id), user: { email: user.email, name: user.name } }, 201);
  }

  if (path === '/api/auth/logout') {
    const u = await sessionUser(req);
    if (u) await dropSession(u.token);
    return json({ ok: true });
  }
  return null;
}

export async function handle(req: IncomingMessage, res: ServerResponse) {
  const send = (r: HttpResult) => {
    res.writeHead(r.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(r.body));
  };
  try {
    await init();
    const url = new URL(req.url || '/', 'http://localhost');
    const method = req.method || 'GET';
    const requestedPath = url.searchParams.get('__path');
    const path = requestedPath ? `/api/${requestedPath}` : url.pathname;
    const body = ['POST', 'PUT', 'PATCH'].includes(method) ? await readBody(req) : {};
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const query = Object.fromEntries(url.searchParams);

    const auth = await authRoute(path, body, ip, req);
    if (auth) return send(auth);

    const me = await sessionUser(req);

    const createAccountMatch = /^\/api\/admin\/accounts\/(individual|institution)$/.exec(path);
    if (method === 'POST' && createAccountMatch && me) {
      const email = normEmail(body.loginEmail);
      const password = String(body.password || '');
      const name = String(body.name || '').trim();
      if (!validEmail(email)) return send(error('Enter a valid login email address.', 400));
      if (password.length < MIN_PASSWORD) return send(error(`Set a temporary password of at least ${MIN_PASSWORD} characters.`, 400));
      if (!name) return send(error('Name is required.', 400));
      if (await findUser(email)) return send(error('An account with this email already exists.', 409));

      const user = await createUser(email, password, name);
      const target = createAccountMatch[1] === 'individual' ? '/api/admin/members' : '/api/admin/institutions';
      const result = await handler('POST', target, {
        user: me,
        body: { ...body, email: body.email || email, __loginUserId: user.id },
        query,
      });
      if (result.status >= 300) await deleteUser(user.id);
      return send(result);
    }

    // Inviting an admin who has no login yet also creates their login, so the Super Admin hands them the password.
    if (method === 'POST' && path === '/api/admin/accounts/invite' && me) {
      const email = normEmail(body.email);
      const password = String(body.password || '');
      const exists = email ? await findUser(email) : undefined;
      if (email && !exists && password.length < MIN_PASSWORD) return send(error(`Set a temporary password of at least ${MIN_PASSWORD} characters for the new admin.`, 400));
      const result = await handler(method, url.pathname, { user: me, body, query });
      if (result.status < 300 && email && !exists) await createUser(email, password);
      return send(result);
    }

    send(await handler(method, path, { user: me, body, query }));
  } catch (e: any) {
    console.error(e);
    send(error(e?.message === 'Payload too large' ? 'Payload too large' : 'Something went wrong.', e?.message === 'Payload too large' ? 413 : 500));
  }
}
