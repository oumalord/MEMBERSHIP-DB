// Local stand-in for the AppDeploy runtime (`@appdeploy/sdk`) so backend/index.ts runs unchanged on this machine.
import { randomUUID } from 'node:crypto';
import { pool } from './pg';

export interface HttpResult { status: number; body: unknown }
export type Ctx = { user?: { userId: string; email?: string; name?: string }; body: any; params: Record<string, string>; query: Record<string, string> };
type Step = (ctx: any) => Promise<HttpResult | void> | HttpResult | void;

export const json = (body: unknown, status = 200): HttpResult => ({ status, body });
export const error = (message: string, status = 400): HttpResult => ({ status, body: { message } });
export const requireAuth = (): Step => (ctx) => (ctx.user ? undefined : error('Please sign in to continue.', 401));

export function router(routes: Record<string, Step[]>) {
  const compiled = Object.entries(routes).map(([key, steps]) => {
    const [method, path] = key.split(' ');
    const names: string[] = [];
    const pattern = new RegExp('^' + path.replace(/:([A-Za-z]+)/g, (_m, n) => { names.push(n); return '([^/]+)'; }) + '/?$');
    return { method, pattern, names, steps };
  });

  return async (method: string, path: string, ctx: Omit<Ctx, 'params'>): Promise<HttpResult> => {
    let pathMatched = false;
    for (const r of compiled) {
      const m = r.pattern.exec(path);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      const params: Record<string, string> = {};
      r.names.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
      const full: Ctx = { ...ctx, params };
      for (const step of r.steps) {
        const out = await step(full);
        if (out) return out;
      }
      return error('Handler returned no response', 500);
    }
    return error(pathMatched ? 'Method not allowed' : 'Not found', pathMatched ? 405 : 404);
  };
}

type Row = Record<string, any>;

// Each backend table is a Postgres table of (id, data jsonb); names are whitelisted because they are interpolated into SQL.
export const TABLES = ['admins', 'communications', 'events', 'institution_categories', 'institutions', 'members', 'participations', 'settings', 'transactions'] as const;
const table = (name: string) => {
  if (!(TABLES as readonly string[]).includes(name)) throw new Error(`Unknown table: ${name}`);
  return `"${name}"`;
};

export const db = {
  async list<T = Row>(name: string, opts: { filter?: Row; limit?: number } = {}): Promise<{ items: (T & { id: string })[] }> {
    const { rows } = await pool().query(
      `SELECT id, data FROM ${table(name)} WHERE data @> $1::jsonb ORDER BY created_at, id LIMIT $2`,
      [JSON.stringify(opts.filter || {}), opts.limit ?? 100],
    );
    return { items: rows.map((r) => ({ id: r.id, ...r.data })) as any };
  },
  async get<T = Row>(name: string, ids: string[]): Promise<((T & { id: string }) | undefined)[]> {
    if (ids.length === 0) return [];
    const { rows } = await pool().query(`SELECT id, data FROM ${table(name)} WHERE id = ANY($1::uuid[])`, [ids]);
    const byId = new Map(rows.map((r) => [r.id, { id: r.id, ...r.data }]));
    return ids.map((id) => byId.get(id) as any);
  },
  async add(name: string, records: Row[]): Promise<string[]> {
    const ids = records.map(() => randomUUID());
    for (let i = 0; i < records.length; i++) {
      await pool().query(`INSERT INTO ${table(name)} (id, data) VALUES ($1, $2::jsonb)`, [ids[i], JSON.stringify(records[i])]);
    }
    return ids;
  },
  async update(name: string, updates: { id: string; record: Row }[]): Promise<boolean[]> {
    const out: boolean[] = [];
    for (const { id, record } of updates) {
      const { id: _drop, ...rest } = record;
      const r = await pool().query(`UPDATE ${table(name)} SET data = $2::jsonb WHERE id = $1`, [id, JSON.stringify(rest)]);
      out.push((r.rowCount ?? 0) > 0);
    }
    return out;
  },
  async delete(name: string, ids: string[]): Promise<boolean[]> {
    const out: boolean[] = [];
    for (const id of ids) {
      const r = await pool().query(`DELETE FROM ${table(name)} WHERE id = $1`, [id]);
      out.push((r.rowCount ?? 0) > 0);
    }
    return out;
  },
};
