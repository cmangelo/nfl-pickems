import './_env';
import { runMigrations } from './migrate-lib';

runMigrations().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
