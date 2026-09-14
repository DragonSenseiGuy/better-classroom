import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authUrl, hasGoogleClient } from '#lib/server/google.ts';

export const GET: RequestHandler = ({ url, cookies }) => {
	if (!hasGoogleClient()) error(500, 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set.');
	const state = crypto.randomUUID();
	cookies.set('oauth_state', state, {
		path: '/auth',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 600
	});
	redirect(302, authUrl(url.origin, state), { external: true });
};
