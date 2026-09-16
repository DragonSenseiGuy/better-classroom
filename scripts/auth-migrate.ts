import { configure } from '../src/lib/server/config';
import { readEnv } from '../src/lib/server/read-env';

configure({ databasePath: readEnv().DATABASE_PATH });
const { auth } = await import('../src/lib/server/auth');

const ctx = await auth.$context;
await ctx.runMigrations();
console.log(`Better Auth tables are up to date in ${auth.options.database.filename}`);
