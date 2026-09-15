import type { ServerInit } from '@sveltejs/kit/hooks';
import {
	APPS_SCRIPT_URL,
	APPS_SCRIPT_KEY,
	SYNC_INTERVAL_MINUTES,
	DATABASE_PATH,
	GOOGLE_CLIENT_ID,
	GOOGLE_CLIENT_SECRET
} from '$app/env/private';
import { configure, registerSourceCheck } from '#lib/server/config.ts';
import { getConnection } from '#lib/server/store.ts';
import { googleProvider } from '#lib/server/google.ts';
import { appsScriptProvider } from '#lib/server/classroom.ts';
import { webProvider } from '#lib/server/rich.ts';
import { hasRecordSource, registerProviders } from '#lib/server/providers.ts';
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
	registerProviders(googleProvider, appsScriptProvider, webProvider);
	registerSourceCheck(hasRecordSource);
	const saved = getConnection();
	if (saved) configure({ appsScriptUrl: saved.url, appsScriptKey: saved.key });
	startScheduler();
};
