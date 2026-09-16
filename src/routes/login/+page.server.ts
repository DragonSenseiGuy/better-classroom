import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { hasGoogleLogin } from '#lib/server/auth.ts';

const safeNext = (value: string | null) =>
	value && value.startsWith('/') && !value.startsWith('//') ? value : '/';

export const load: PageServerLoad = ({ locals, url }) => {
	const next = safeNext(url.searchParams.get('next'));
	if (locals.user) redirect(307, next);
	return { title: 'Sign in', next, googleLogin: hasGoogleLogin };
};
