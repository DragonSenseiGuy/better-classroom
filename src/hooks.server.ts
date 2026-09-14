import type { ServerInit } from '@sveltejs/kit/hooks';
import {
	APPS_SCRIPT_URL,
	APPS_SCRIPT_KEY,
	SYNC_INTERVAL_MINUTES,
	DATABASE_PATH,
	GOOGLE_CLIENT_ID,
	GOOGLE_CLIENT_SECRET
} from '$app/env/private';
import { configure, registerGoogleCheck } from '#lib/server/config.ts';
import { getConnection } from '#lib/server/store.ts';
import { isGoogleConnected } from '#lib/server/google.ts';
import { startScheduler } from '#lib/server/sync.ts';

export const init: ServerInit = async () => {
	configure({
		appsScriptUrl: APPS_SCRIPT_URL,
		appsScriptKey: APPS_SCRIPT_KEY,
		googleClientId: GOOGLE_CLIENT_ID || undefined,
		googleClientSecret: GOOGLE_CLIENT_SECRET || undefined,
		syncIntervalMinutes: SYNC_INTERVAL_MINUTES,
		databasePath: DATABASE_PATH
	});
	registerGoogleCheck(isGoogleConnected);
	const saved = getConnection();
	if (saved) configure({ appsScriptUrl: saved.url, appsScriptKey: saved.key });
	startScheduler();
};
