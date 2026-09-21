import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	probeSession,
	withoutCookie,
	parsePastedCookie,
	probeErrorMessage,
	sanitizeProbeAttempts
} from '#lib/server/web-probe.ts';
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
		if (!getWebSession())
			return json({ ok: false, code: 'state', message: 'No session saved.' }, { status: 400 });
		await runRichSync({ full: true });
		return json({ ok: true, ...summary() });
	}
	let cookie: string;
	if (body.retry === true) {
		const draft = getWebSessionDraft();
		if (!draft)
			return json(
				{ ok: false, code: 'state', message: 'No cookie to retry with.' },
				{ status: 400 }
			);
		cookie = draft;
	} else {
		try {
			cookie = parsePastedCookie(body.cookie);
		} catch (err) {
			return json(probeErrorMessage(err), { status: 400 });
		}
		saveWebSessionDraft(cookie);
	}
	const result = await probeSession(cookie);
	if (!result.ok) {
		const sanitized = { ...result, attempts: sanitizeProbeAttempts(result.attempts) };
		setMeta('richProbe', { at: Date.now(), ...sanitized });
		return json(sanitized, { status: 400 });
	}
	const safe = withoutCookie(result);
	const sanitizedSafe = { ...safe, attempts: sanitizeProbeAttempts(safe.attempts) };
	setMeta('richProbe', { at: Date.now(), ...sanitizedSafe });
	saveWebSession({ cookie: result.cookie, authuser: result.authuser, savedAt: Date.now() });
	deleteMeta('webSessionDraft');
	saveRichStatus({ ok: true, at: Date.now(), updated: 0 });
	runRichSync({ full: true }).catch((err) => console.error('enrichment sync failed', err));
	return json({ ...sanitizedSafe, ...summary() });
};

export const DELETE: RequestHandler = () => {
	saveWebSession(null);
	return json(summary());
};
