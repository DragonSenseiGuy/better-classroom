import {
	BETTER_AUTH_SECRET,
	BETTER_AUTH_URL,
	GOOGLE_CLIENT_ID,
	GOOGLE_CLIENT_SECRET
} from '$app/env/private';

// SvelteKit exposes .env through $app/env/private only. auth.ts reads
// process.env so the migration script can load it outside Vite; import this
// module before auth.ts so both see the same values.
process.env.BETTER_AUTH_SECRET ??= BETTER_AUTH_SECRET;
if (BETTER_AUTH_URL) process.env.BETTER_AUTH_URL ??= BETTER_AUTH_URL;
if (GOOGLE_CLIENT_ID) process.env.GOOGLE_CLIENT_ID ??= GOOGLE_CLIENT_ID;
if (GOOGLE_CLIENT_SECRET) process.env.GOOGLE_CLIENT_SECRET ??= GOOGLE_CLIENT_SECRET;
