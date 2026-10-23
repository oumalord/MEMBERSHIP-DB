// Local stand-in for the AppDeploy runtime (`@appdeploy/sdk`) so backend/index.ts runs unchanged on this machine.
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

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
const DB_FILE = resolve(process.cwd(), 'data', 'db.json');
const tables: Record<string, Record<string, Row>> = existsSync(DB_FILE) ? JSON.parse(readFileSync(DB_FILE, 'utf8')) : {};

function persist() {
  mkdirSync(dirname(DB_FILE), { recursive: true });
  const tmp = DB_FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(tables));
  renameSync(tmp, DB_FILE);
}

const table = (name: string) => (tables[name] ??= {});

export const db = {
  async list<T = Row>(name: string, opts: { filter?: Row; limit?: number } = {}): Promise<{ items: (T & { id: string })[] }> {
    const filter = Object.entries(opts.filter || {});
    const items = Object.entries(table(name))
      .filter(([, rec]) => filter.every(([k, v]) => rec[k] === v))
      .slice(0, opts.limit ?? 100)
      .map(([id, rec]) => ({ id, ...rec }));
    return { items: items as any };
  },
  async get<T = Row>(name: string, ids: string[]): Promise<((T & { id: string }) | undefined)[]> {
    return ids.map((id) => (table(name)[id] ? ({ id, ...table(name)[id] } as any) : undefined));
  },
  async add(name: string, records: Row[]): Promise<string[]> {
    const ids = records.map((rec) => {
      const id = randomUUID();
      table(name)[id] = rec;
      return id;
    });
    persist();
    return ids;
  },
  async update(name: string, updates: { id: string; record: Row }[]): Promise<boolean[]> {
    const out = updates.map(({ id, record }) => {
      if (!table(name)[id]) return false;
      const { id: _drop, ...rest } = record;
      table(name)[id] = rest;
      return true;
    });
    persist();
    return out;
  },
  async delete(name: string, ids: string[]): Promise<boolean[]> {
    const out = ids.map((id) => delete table(name)[id]);
    persist();
    return out;
  },
};
