import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dismiss } from '#lib/server/sync.ts';

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as { ids?: string[]; dismissed?: boolean };
	if (
		!Array.isArray(body.ids) ||
		body.ids.some((id) => typeof id !== 'string' || !/^(announcement|work|material):/.test(id))
	)
		error(400, 'ids must be prefixed strings');
	if (typeof body.dismissed !== 'boolean') error(400, 'dismissed must be a boolean');
	for (const id of body.ids.slice(0, 500)) dismiss(id, body.dismissed);
	return json({ ok: true });
};
