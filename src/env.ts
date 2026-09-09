import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (value: string | undefined) => (value ? value : undefined);

export const variables = defineEnvVars({
	APPS_SCRIPT_URL: {
		schema: optional,
		description: 'Deployed Apps Script web app URL ending in /exec'
	},
	APPS_SCRIPT_KEY: {
		schema: optional,
		description: 'Value of the CLASSROOM_SYNC_KEY script property'
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
