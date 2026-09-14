import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { config, configure } from '#lib/server/config.ts';
import { testConnection } from '#lib/server/classroom.ts';
import { clearGoogleTokens } from '#lib/server/google.ts';
import { saveConnection } from '#lib/server/store.ts';
import { runSync, syncStatus } from '#lib/server/sync.ts';

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => ({}))) as { url?: unknown; key?: unknown };
	const provided = typeof body.url === 'string' && typeof body.key === 'string';
	const url = provided ? (body.url as string).trim() : (config.appsScriptUrl ?? '');
	const key = provided ? (body.key as string).trim() : (config.appsScriptKey ?? '');
	if (!url || !key)
		return json({ ok: false, code: 'url', message: 'Nothing to test yet.' }, { status: 400 });

	const result = await testConnection(url, key);
	if (!result.ok || !provided) return json(result);

	configure({ appsScriptUrl: url, appsScriptKey: key });
	saveConnection({ url, key });
	clearGoogleTokens();
	void runSync({ full: true });
	return json({ ...result, sync: syncStatus() });
};
