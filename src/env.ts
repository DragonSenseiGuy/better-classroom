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
	SYNC_CONCURRENCY: {
		schema: (value) => {
			if (!value) return 2;
			const n = Number(value);
			if (!Number.isInteger(n) || n < 1)
				throw new Error('SYNC_CONCURRENCY must be a whole number of courses, 1 or more');
			return n;
		},
		description: 'How many courses one sync fetches at a time'
	},
	FULL_SYNC_HOURS: {
		schema: (value) => {
			if (!value) return 6;
			const n = Number(value);
			if (!Number.isFinite(n) || n <= 0)
				throw new Error('FULL_SYNC_HOURS must be a number of hours above 0');
			return n;
		},
		description: 'How often a sync refetches everything instead of only recent changes'
	},
	DATABASE_PATH: {
		schema: (value) => value || 'data/classroom.sqlite',
		description: 'Shared auth database; per-user Classroom caches live in users/ beside it'
	},
	SEED_USER: {
		schema: optional,
		description:
			'Account id that `bun run seed` fills with fixture data (defaults to the first account)'
	}
});
