import { betterAuth } from 'better-auth';
import { authDb } from './db';
import { readEnv } from './read-env';

const { BETTER_AUTH_SECRET, BETTER_AUTH_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = readEnv();

export const hasGoogleLogin = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);

export const auth = betterAuth({
	database: authDb(),
	secret: BETTER_AUTH_SECRET,
	baseURL: BETTER_AUTH_URL,
	emailAndPassword: { enabled: true },
	socialProviders:
		GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET
			? { google: { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET } }
			: {},
	session: { cookieCache: { enabled: true, maxAge: 5 * 60 } }
});

export type AuthSession = typeof auth.$Infer.Session;
