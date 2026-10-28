import pg from 'pg';
import { config } from '../config.js';
const { Pool } = pg;

let pool;
export function getPool() {
  if (!config.databaseUrl) throw new Error('DATABASE_URL is missing. Copy .env.example to .env and configure PostgreSQL.');
  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      application_name: 'ai-workforce-mvp',
      ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: true } : undefined,
    });
    pool.on('error', (err) => console.error('[db] idle client error:', err.message));
  }
  return pool;
}
export async function query(text, params = []) { return getPool().query(text, params); }
export async function closePool() { if (pool) { await pool.end(); pool = undefined; } }
