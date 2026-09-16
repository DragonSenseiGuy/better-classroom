import type { PageServerLoad } from './$types';
import { getConnection, getKeepAlive, getRichStatus, getWebSession } from '#lib/server/store.ts';
import { providerStatuses } from '#lib/server/providers.ts';

export const load: PageServerLoad = () => {
	const session = getWebSession();
	const connection = getConnection();
	return {
		title: 'Settings',
		crumbs: [{ label: 'Settings' }],
		providers: providerStatuses(),
		connection: {
			url: connection?.url ?? '',
			keyHint: connection ? connection.key.slice(-4) : ''
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
