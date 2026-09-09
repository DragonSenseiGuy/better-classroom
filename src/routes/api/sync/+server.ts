import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { runSync, syncStatus } from '#lib/server/sync.ts';

export const POST: RequestHandler = () => {
	void runSync();
	return json(syncStatus());
};
