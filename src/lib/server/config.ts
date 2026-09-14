export type Config = {
	databasePath: string;
	appsScriptUrl?: string;
	appsScriptKey?: string;
	googleClientId?: string;
	googleClientSecret?: string;
	syncIntervalMinutes: number;
	syncConcurrency: number;
	fullSyncHours: number;
};

export const config: Config = {
	databasePath: process.env.DATABASE_PATH || 'data/classroom.sqlite',
	appsScriptUrl: process.env.APPS_SCRIPT_URL || undefined,
	appsScriptKey: process.env.APPS_SCRIPT_KEY || undefined,
	googleClientId: process.env.GOOGLE_CLIENT_ID || undefined,
	googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || undefined,
	syncIntervalMinutes: Number(process.env.SYNC_INTERVAL_MINUTES) || 5,
	syncConcurrency: Number(process.env.SYNC_CONCURRENCY) || 2,
	fullSyncHours: Number(process.env.FULL_SYNC_HOURS) || 6
};

export function configure(patch: Partial<Config>) {
	Object.assign(config, patch);
}

let googleConnected: () => boolean = () => false;
export function registerGoogleCheck(check: () => boolean) {
	googleConnected = check;
}

export const isConfigured = () =>
	googleConnected() || Boolean(config.appsScriptUrl && config.appsScriptKey);
