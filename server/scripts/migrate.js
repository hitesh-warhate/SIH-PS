import { migrate } from '../src/migrate.js';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy .env.example to server/.env and fill it in.');
  process.exit(1);
}
const applied = await migrate(process.env.DATABASE_URL, { log: (m) => console.log(m) });
console.log(applied.length ? `Done: ${applied.length} migration(s) applied.` : 'Database is up to date.');
