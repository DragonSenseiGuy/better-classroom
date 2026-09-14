import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { isConfigured } from '#lib/server/config.ts';

export const load: LayoutServerLoad = () => {
	if (!isConfigured()) redirect(307, '/setup');
	return {};
};
