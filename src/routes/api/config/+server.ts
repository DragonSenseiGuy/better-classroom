import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { testConnection } from '#lib/server/classroom.ts';
import { getConnection, saveConnection } from '#lib/server/store.ts';
import { runSync, syncStatus } from '#lib/server/sync.ts';

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => ({}))) as { url?: unknown; key?: unknown };
	const provided = typeof body.url === 'string' && typeof body.key === 'string';
	const saved = getConnection();
	const url = provided ? (body.url as string).trim() : (saved?.url ?? '');
	const key = provided ? (body.key as string).trim() : (saved?.key ?? '');
	if (!url || !key)
		return json({ ok: false, code: 'url', message: 'Nothing to test yet.' }, { status: 400 });

	const result = await testConnection(url, key);
	if (!result.ok || !provided) return json(result);

	saveConnection({ url, key });
	void runSync({ full: true });
	return json({ ...result, sync: syncStatus() });
};
