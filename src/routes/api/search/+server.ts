import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { search } from '#lib/server/search.ts';

export const GET: RequestHandler = ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	const limit = Math.min(100, Number(url.searchParams.get('limit') ?? 20) || 20);
	return json(search(q, limit));
};
