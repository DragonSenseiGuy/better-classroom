import { auth } from '../src/lib/server/auth';

const ctx = await auth.$context;
await ctx.runMigrations();
console.log(`Better Auth tables are up to date in ${auth.options.database.filename}`);
