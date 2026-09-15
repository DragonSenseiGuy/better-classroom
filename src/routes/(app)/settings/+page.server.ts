import type { PageServerLoad } from './$types';
import { config } from '#lib/server/config.ts';
import { getKeepAlive, getRichStatus, getWebSession } from '#lib/server/store.ts';
import { providerStatuses } from '#lib/server/providers.ts';

export const load: PageServerLoad = () => {
	const session = getWebSession();
	return {
		title: 'Settings',
		crumbs: [{ label: 'Settings' }],
		providers: providerStatuses(),
		connection: {
			url: config.appsScriptUrl ?? '',
			keyHint: config.appsScriptKey ? config.appsScriptKey.slice(-4) : ''
		},
		rich: {
			configured: Boolean(session),
			savedAt: session?.savedAt,
			authuser: session?.authuser,
			status: getRichStatus(),
			keepAlive: getKeepAlive()
		}
	};
};
