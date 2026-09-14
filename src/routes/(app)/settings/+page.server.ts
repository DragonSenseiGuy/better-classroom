import type { PageServerLoad } from './$types';
import { config } from '#lib/server/config.ts';
import { getRichStatus, getWebSession } from '#lib/server/store.ts';

export const load: PageServerLoad = () => {
	const session = getWebSession();
	return {
		title: 'Settings',
		crumbs: [{ label: 'Settings' }],
		connection: {
			url: config.appsScriptUrl ?? '',
			keyHint: config.appsScriptKey ? config.appsScriptKey.slice(-4) : ''
		},
		rich: {
			configured: Boolean(session),
			savedAt: session?.savedAt,
			authuser: session?.authuser,
			status: getRichStatus()
		}
	};
};
