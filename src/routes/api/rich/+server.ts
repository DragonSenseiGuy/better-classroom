import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { probeSession } from '#lib/server/rich.ts';
import {
	deleteMeta,
	getKeepAlive,
	getMeta,
	getRichStatus,
	getWebSession,
	getWebSessionDraft,
	saveRichStatus,
	saveWebSession,
	saveWebSessionDraft,
	setMeta
} from '#lib/server/store.ts';
import { runRichSync } from '#lib/server/sync.ts';

const summary = () => {
	const session = getWebSession();
	return {
		configured: Boolean(session),
		savedAt: session?.savedAt,
		authuser: session?.authuser,
		status: getRichStatus(),
		keepAlive: getKeepAlive(),
		probe: getMeta<unknown>('richProbe') ?? null
	};
};

export const GET: RequestHandler = () => json(summary());

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => ({}))) as {
		cookie?: unknown;
		retry?: unknown;
		sync?: unknown;
	};
	if (body.sync === true) {
		if (!getWebSession()) return json({ ok: false, message: 'No session saved.' }, { status: 400 });
		await runRichSync({ full: true });
		return json({ ok: true, ...summary() });
	}
	let cookie: string;
	if (body.retry === true) {
		const draft = getWebSessionDraft();
		if (!draft) return json({ ok: false, message: 'No cookie to retry with.' }, { status: 400 });
		cookie = draft;
	} else {
		if (typeof body.cookie !== 'string' || !/(^|;\s*)SID=/.test(body.cookie))
			return json(
				{ ok: false, message: 'Paste the whole Cookie header. It should include SID and SAPISID.' },
				{ status: 400 }
			);
		cookie = body.cookie.replace(/^cookie:\s*/i, '').trim();
		saveWebSessionDraft(cookie);
	}
	const result = await probeSession(cookie);
	setMeta('richProbe', { at: Date.now(), ...result, cookie: undefined });
	if (!result.ok) return json(result, { status: 400 });
	saveWebSession({ cookie: result.cookie, authuser: result.authuser, savedAt: Date.now() });
	deleteMeta('webSessionDraft');
	saveRichStatus({ ok: true, at: Date.now(), updated: 0 });
	void runRichSync({ full: true });
	return json({ ...result, cookie: undefined, ...summary() });
};

export const DELETE: RequestHandler = () => {
	saveWebSession(null);
	return json(summary());
};
