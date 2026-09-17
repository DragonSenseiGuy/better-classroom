import { createAuth } from '../src/lib/server/auth-config';
import { configure } from '../src/lib/server/config';
import { readEnv } from '../src/lib/server/read-env';

const env = readEnv();
configure({ databasePath: env.DATABASE_PATH });
const auth = createAuth(env);

const ctx = await auth.$context;
await ctx.runMigrations();
console.log(`Better Auth tables are up to date in ${env.DATABASE_PATH}`);
