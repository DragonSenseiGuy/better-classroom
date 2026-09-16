import { betterAuth } from 'better-auth';
import { authDb } from './db';
import type { Env } from './read-env';

export type AuthEnv = Pick<
	Env,
	'BETTER_AUTH_SECRET' | 'BETTER_AUTH_URL' | 'GOOGLE_CLIENT_ID' | 'GOOGLE_CLIENT_SECRET'
>;

export const hasGoogleLogin = (env: AuthEnv) =>
	Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

export function createAuth(env: AuthEnv) {
	return betterAuth({
		database: authDb(),
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		emailAndPassword: { enabled: true },
		socialProviders:
			env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
				? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
				: {},
		session: { cookieCache: { enabled: true, maxAge: 5 * 60 } }
	});
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = Auth['$Infer']['Session'];
