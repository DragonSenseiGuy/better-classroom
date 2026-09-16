import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { hasGoogleLogin } from '#lib/server/auth.ts';
import { safeNext } from '#lib/server/redirects.ts';

export const load: PageServerLoad = ({ locals, url }) => {
	const next = safeNext(url.searchParams.get('next'), url.origin);
	if (locals.user) redirect(307, next);
	return { title: 'Sign in', next, googleLogin: hasGoogleLogin };
};
