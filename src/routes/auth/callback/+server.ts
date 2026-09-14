import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exchangeCode, profile } from '#lib/server/google.ts';
import { setProfile } from '#lib/server/store.ts';
import { runSync } from '#lib/server/sync.ts';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const denied = url.searchParams.get('error');
	if (denied) redirect(302, `/setup?error=${encodeURIComponent(denied)}`);
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const expected = cookies.get('oauth_state');
	cookies.delete('oauth_state', { path: '/auth' });
	if (!code || !state || state !== expected) error(400, 'Sign-in state mismatch. Try again.');
	await exchangeCode(url.origin, code);
	const me = await profile();
	setProfile({ id: me.id, name: me.name, email: me.email, photoUrl: me.photoUrl });
	void runSync({ full: true });
	redirect(302, '/');
};
