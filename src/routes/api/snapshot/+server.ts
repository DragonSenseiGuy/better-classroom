import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { snapshot } from '#lib/server/store.ts';
import { syncStatus } from '#lib/server/sync.ts';

export const GET: RequestHandler = () => json(snapshot(syncStatus()));
