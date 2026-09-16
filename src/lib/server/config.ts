export type Config = {
	databasePath: string;
	syncIntervalMinutes: number;
	syncConcurrency: number;
	fullSyncHours: number;
};

export const config: Config = {
	databasePath: 'data/classroom.sqlite',
	syncIntervalMinutes: 5,
	syncConcurrency: 2,
	fullSyncHours: 6
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
