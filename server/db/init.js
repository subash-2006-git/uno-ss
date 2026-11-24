import 'dotenv/config';
import { initDb, dbEnabled } from './index.js';

if (!dbEnabled) {
  console.error('Set DATABASE_URL in server/.env first (see server/.env.example).');
  process.exit(1);
}
await initDb();
process.exit(0);
