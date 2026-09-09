export type Config = {
	databasePath: string;
	appsScriptUrl?: string;
	appsScriptKey?: string;
	syncIntervalMinutes: number;
	syncConcurrency: number;
	fullSyncHours: number;
};

export const config: Config = {
	databasePath: process.env.DATABASE_PATH || 'data/classroom.sqlite',
	appsScriptUrl: process.env.APPS_SCRIPT_URL || undefined,
	appsScriptKey: process.env.APPS_SCRIPT_KEY || undefined,
	syncIntervalMinutes: Number(process.env.SYNC_INTERVAL_MINUTES) || 5,
	syncConcurrency: Number(process.env.SYNC_CONCURRENCY) || 2,
	fullSyncHours: Number(process.env.FULL_SYNC_HOURS) || 6
};

export function configure(patch: Partial<Config>) {
	Object.assign(config, patch);
}

export const isConfigured = () => Boolean(config.appsScriptUrl && config.appsScriptKey);
