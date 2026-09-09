import type { ServerInit } from '@sveltejs/kit/hooks';
import {
	APPS_SCRIPT_URL,
	APPS_SCRIPT_KEY,
	SYNC_INTERVAL_MINUTES,
	DATABASE_PATH
} from '$app/env/private';
import { configure } from '#lib/server/config.ts';
import { startScheduler } from '#lib/server/sync.ts';

export const init: ServerInit = async () => {
	configure({
		appsScriptUrl: APPS_SCRIPT_URL,
		appsScriptKey: APPS_SCRIPT_KEY,
		syncIntervalMinutes: SYNC_INTERVAL_MINUTES,
		databasePath: DATABASE_PATH
	});
	startScheduler();
};
