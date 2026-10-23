import { createServer, type IncomingMessage } from 'node:http';
import { randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';
import { migrate, pool } from './pg';
import { db, error, json, type HttpResult } from '@appdeploy/sdk';
import { handler } from '../backend/index';

if (existsSync('.env')) process.loadEnvFile('.env');

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const PORT = Number(process.env.API_PORT || 8787);
const SESSION_MS = 7 * 24 * 3600 * 1000;
const MIN_PASSWORD = 8;

interface UserRow { id: string; email: string; name: string; salt: string; hash: string }
interface AuthFile { users: UserRow[]; sessions: Record<string, { userId: string; exp: number }> }

await migrate();

// Users and sessions are cached in memory and written through to Postgres.
const authData: AuthFile = { users: [], sessions: {} };
for (const r of (await pool().query('SELECT id, email, name, salt, hash FROM auth_users')).rows) authData.users.push(r);
for (const r of (await pool().query('SELECT token, user_id, expires_at FROM auth_sessions')).rows) authData.sessions[r.token] = { userId: r.user_id, exp: Number(r.expires_at) };

const dbLog = (e: unknown) => console.error('Database write failed:', e);
const upsertUser = (u: UserRow) => pool().query(
  `INSERT INTO auth_users (id, email, name, salt, hash) VALUES ($1,$2,$3,$4,$5)
   ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, salt = EXCLUDED.salt, hash = EXCLUDED.hash`,
  [u.id, u.email, u.name, u.salt, u.hash],
);
const dropSession = (token: string) => { pool().query('DELETE FROM auth_sessions WHERE token = $1', [token]).catch(dbLog); };

const normEmail = (e: unknown) => String(e || '').trim().toLowerCase();
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const findUser = (email: string) => authData.users.find((u) => u.email === email);

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
  authData.users.push(user);
  return user;
}

async function issueToken(userId: string) {
  const token = randomBytes(32).toString('hex');
  const exp = Date.now() + SESSION_MS;
  await pool().query('INSERT INTO auth_sessions (token, user_id, expires_at) VALUES ($1,$2,$3)', [token, userId, exp]);
  authData.sessions[token] = { userId, exp };
  return token;
}

function sessionUser(req: IncomingMessage) {
  const m = /^Bearer (.+)$/.exec(String(req.headers.authorization || ''));
  const s = m && authData.sessions[m[1]];
  if (!s) return undefined;
  if (s.exp < Date.now()) { delete authData.sessions[m![1]]; dropSession(m![1]); return undefined; }
  const u = authData.users.find((x) => x.id === s.userId);
  return u ? { token: m![1], userId: u.id, email: u.email, name: u.name } : undefined;
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
  if (!email || !password) { console.warn('SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD not set in .env: no Super Admin seeded.'); return; }
  if (password.length < MIN_PASSWORD) throw new Error('SUPER_ADMIN_PASSWORD must be at least 8 characters');
  const name = process.env.SUPER_ADMIN_NAME || 'Super Admin';

  let user = findUser(email);
  if (!user) user = await createUser(email, password, name);
  else if (!(await verifyPassword(user, password))) { Object.assign(user, await hashPassword(password)); await upsertUser(user); }

  const { items } = await db.list<any>('admins', { filter: { email }, limit: 1 });
  const record = { userId: user.id, email, name: user.name, status: 'active', isSuperAdmin: true, canEdit: true, canManageAdmins: true };
  if (items[0]) await db.update('admins', [{ id: items[0].id, record }]);
  else await db.add('admins', [record]);
}

async function readBody(req: IncomingMessage) {
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
    const user = findUser(email);
    if (!(await verifyPassword(user, String(body.password || '')))) { recordFailure(key); return error('Invalid email or password.', 401); }
    failures.delete(key);
    return json({ token: await issueToken(user!.id), user: { email: user!.email, name: user!.name } });
  }

  if (path === '/api/auth/register') {
    const email = normEmail(body.email);
    const password = String(body.password || '');
    if (!validEmail(email)) return error('Enter a valid email address.', 400);
    if (password.length < MIN_PASSWORD) return error(`Password must be at least ${MIN_PASSWORD} characters.`, 400);
    if (findUser(email)) return error('An account with this email already exists.', 409);
    // Invited admin emails are reserved so nobody can claim an invitation by registering first.
    const { items } = await db.list<any>('admins', { filter: { email }, limit: 1 });
    if (items.length > 0) return error('This email belongs to an administrator. Sign in with the password your Super Admin gave you.', 403);
    const user = await createUser(email, password);
    return json({ token: await issueToken(user.id), user: { email: user.email, name: user.name } }, 201);
  }

  if (path === '/api/auth/logout') {
    const u = sessionUser(req);
    if (u) { delete authData.sessions[u.token]; dropSession(u.token); }
    return json({ ok: true });
  }
  return null;
}

await seedSuperAdmin();

createServer(async (req, res) => {
  const send = (r: HttpResult) => {
    res.writeHead(r.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(r.body));
  };
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    const method = req.method || 'GET';
    const body = ['POST', 'PUT', 'PATCH'].includes(method) ? await readBody(req) : {};
    const ip = req.socket.remoteAddress || '';

    const auth = await authRoute(url.pathname, body, ip, req);
    if (auth) return send(auth);

    const me = sessionUser(req);

    // Inviting an admin who has no login yet also creates their login, so the Super Admin hands them the password.
    if (method === 'POST' && url.pathname === '/api/admin/accounts/invite' && me) {
      const email = normEmail(body.email);
      const password = String(body.password || '');
      if (email && !findUser(email) && password.length < MIN_PASSWORD) return send(error(`Set a temporary password of at least ${MIN_PASSWORD} characters for the new admin.`, 400));
      const result = await handler(method, url.pathname, { user: me, body, query: Object.fromEntries(url.searchParams) });
      if (result.status < 300 && email && !findUser(email)) await createUser(email, password);
      return send(result);
    }

    send(await handler(method, url.pathname, { user: me, body, query: Object.fromEntries(url.searchParams) }));
  } catch (e: any) {
    console.error(e);
    send(error(e?.message === 'Payload too large' ? 'Payload too large' : 'Something went wrong.', e?.message === 'Payload too large' ? 413 : 500));
  }
}).listen(PORT, '127.0.0.1', () => console.log(`KGGA API listening on http://127.0.0.1:${PORT}`));
