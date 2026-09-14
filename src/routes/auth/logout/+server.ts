import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clearGoogleTokens } from '#lib/server/google.ts';

export const POST: RequestHandler = () => {
	clearGoogleTokens();
	redirect(303, '/setup');
};
