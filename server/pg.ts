import pg from 'pg';

let instance: pg.Pool | undefined;

// Created lazily so DATABASE_URL from .env is loaded before the first connection.
export function pool() {
  if (!instance) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set in .env');
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    instance = new pg.Pool({ connectionString: url, max: 5, ssl: local ? undefined : { rejectUnauthorized: false } });
  }
  return instance;
}

const BACKEND_TABLES = ['admins', 'communications', 'events', 'institution_categories', 'institutions', 'members', 'participations', 'settings', 'transactions'];

export async function migrate() {
  const p = pool();
  for (const t of BACKEND_TABLES) {
    await p.query(`CREATE TABLE IF NOT EXISTS "${t}" (
      id uuid PRIMARY KEY,
      data jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await p.query(`CREATE INDEX IF NOT EXISTS "${t}_data_gin" ON "${t}" USING gin (data jsonb_path_ops)`);
  }
  await p.query(`CREATE TABLE IF NOT EXISTS auth_users (
    id uuid PRIMARY KEY,
    email text NOT NULL UNIQUE,
    name text NOT NULL,
    salt text NOT NULL,
    hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await p.query(`CREATE TABLE IF NOT EXISTS auth_sessions (
    token text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    expires_at bigint NOT NULL
  )`);
  await p.query('DELETE FROM auth_sessions WHERE expires_at < $1', [Date.now()]);
}
