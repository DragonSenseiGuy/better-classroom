export type Config = {
	databasePath: string;
	syncIntervalMinutes: number;
	syncConcurrency: number;
	fullSyncHours: number;
};

export const config: Config = {
	databasePath: process.env.DATABASE_PATH || 'data/classroom.sqlite',
	syncIntervalMinutes: Number(process.env.SYNC_INTERVAL_MINUTES) || 5,
	syncConcurrency: Number(process.env.SYNC_CONCURRENCY) || 2,
	fullSyncHours: Number(process.env.FULL_SYNC_HOURS) || 6
};

export function configure(patch: Partial<Config>) {
	Object.assign(config, patch);
}

// The provider registry decides whether the current user has a usable record
// source; it is registered from hooks so this module stays free of provider imports.
let sourceConnected: () => boolean = () => false;
export function registerSourceCheck(check: () => boolean) {
	sourceConnected = check;
}

export const isConfigured = () => sourceConnected();
