import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (value: string | undefined) => (value ? value : undefined);

export const variables = defineEnvVars({
	APPS_SCRIPT_KEY: {
		schema: optional,
		description: 'Key the local mock Classroom server accepts (scripts/mock-classroom.ts)'
	},
	GOOGLE_CLIENT_ID: {
		schema: optional,
		description: 'OAuth client ID for Google account sign-in (Better Auth)'
	},
	GOOGLE_CLIENT_SECRET: {
		schema: optional,
		description: 'OAuth client secret for Google account sign-in (Better Auth)'
	},
	BETTER_AUTH_SECRET: {
		schema: (value) => {
			if (!value || value.length < 32)
				throw new Error('BETTER_AUTH_SECRET must be at least 32 characters');
			return value;
		},
		description: 'Signs session cookies; generate with `openssl rand -base64 32`'
	},
	BETTER_AUTH_URL: {
		schema: optional,
		description: 'Public origin of the app, e.g. http://localhost:5173'
	},
	SYNC_INTERVAL_MINUTES: {
		schema: (value) => {
			if (!value) return 5;
			const n = Number(value);
			if (!Number.isFinite(n) || n < 1)
				throw new Error('SYNC_INTERVAL_MINUTES must be a number of minutes, 1 or more');
			return n;
		}
	},
	DATABASE_PATH: { schema: (value) => value || 'data/classroom.sqlite' }
});
