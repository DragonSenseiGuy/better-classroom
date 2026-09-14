import type { PageServerLoad } from './$types';
import { config } from '#lib/server/config.ts';

export const load: PageServerLoad = () => ({
	title: 'Settings',
	crumbs: [{ label: 'Settings' }],
	connection: {
		url: config.appsScriptUrl ?? '',
		keyHint: config.appsScriptKey ? config.appsScriptKey.slice(-4) : ''
	}
});
