import { betterAuth } from 'better-auth';
import { authDb } from './db';

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

export const hasGoogleLogin = Boolean(googleClientId && googleClientSecret);

export const auth = betterAuth({
	database: authDb(),
	secret: process.env.BETTER_AUTH_SECRET,
	baseURL: process.env.BETTER_AUTH_URL,
	emailAndPassword: { enabled: true },
	socialProviders: hasGoogleLogin
		? { google: { clientId: googleClientId!, clientSecret: googleClientSecret! } }
		: {},
	session: { cookieCache: { enabled: true, maxAge: 5 * 60 } }
});

export type AuthSession = typeof auth.$Infer.Session;
export type AuthUser = AuthSession['user'];
