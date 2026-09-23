import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { isConfigured } from '#lib/server/config.ts';
import { snapshot } from '#lib/server/store.ts';
import { webExpiredState } from '#lib/server/rich.ts';
import { syncStatus } from '#lib/server/sync.ts';

export const load: LayoutServerLoad = () => {
	if (!isConfigured()) redirect(307, '/setup');
	return { snapshot: snapshot(syncStatus()), webExpired: webExpiredState() };
};
