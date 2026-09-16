import {
	BETTER_AUTH_SECRET,
	BETTER_AUTH_URL,
	GOOGLE_CLIENT_ID,
	GOOGLE_CLIENT_SECRET
} from '$app/env/private';
import { createAuth, hasGoogleLogin as hasGoogle, type AuthEnv } from './auth-config';

const env: AuthEnv = {
	BETTER_AUTH_SECRET,
	BETTER_AUTH_URL,
	GOOGLE_CLIENT_ID,
	GOOGLE_CLIENT_SECRET
};

export const auth = createAuth(env);
export const hasGoogleLogin = hasGoogle(env);

export type { AuthSession } from './auth-config';
