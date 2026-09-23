import {
	BETTER_AUTH_SECRET,
	BETTER_AUTH_URL,
	GOOGLE_CLIENT_ID,
	GOOGLE_CLIENT_SECRET
} from '$app/env/private';
import { config } from './config';
import {
	createAuth,
	hasGoogleLogin as hasGoogle,
	type Auth,
	type AuthEnv
} from './auth-config';

const env: AuthEnv = {
	BETTER_AUTH_SECRET,
	BETTER_AUTH_URL,
	GOOGLE_CLIENT_ID,
	GOOGLE_CLIENT_SECRET
};

// Module-local: instances are lightweight wrappers resolved per request, while
// the write-lock-sensitive raw handles they wrap live on globalThis (see db.ts)
// and survive module re-evaluation.
const instances = new Map<string, Auth>();

/**
 * The Better Auth instance for the currently configured database.
 *
 * Created lazily (and cached per path) because configure() runs in
 * ServerInit, after module imports: an eager singleton would keep the
 * default-path handle forever while the rest of the server uses
 * DATABASE_PATH.
 */
export function getAuth() {
	const path = config.databasePath;
	let instance = instances.get(path);
	if (!instance) {
		instance = createAuth(env);
		instances.set(path, instance);
	}
	return instance;
}
export const hasGoogleLogin = hasGoogle(env);

export type { AuthSession } from './auth-config';
