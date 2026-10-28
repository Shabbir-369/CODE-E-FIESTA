import fs from 'node:fs';
import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getPool, closePool } from './pool.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '../../migrations');
try {
  const files = (await readdir(migrationsDir)).filter((name) => /^\d+_.*\.sql$/.test(name)).sort();
  if (!files.length) throw new Error('No SQL migrations found.');
  for (const name of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, name), 'utf8');
    await getPool().query(sql);
    console.log(`✓ PostgreSQL schema migrated (${name}).`);
  }
} catch (error) {
  console.error('Migration failed:', error.message);
  process.exitCode = 1;
} finally { await closePool(); }
