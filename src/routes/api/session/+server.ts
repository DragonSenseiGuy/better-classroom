import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	probeSessionBase,
	withoutCookie,
	parsePastedCookie,
	probeErrorMessage
} from '#lib/server/web-probe.ts';
import { saveWebSession } from '#lib/server/store.ts';
import { runSync, syncStatus } from '#lib/server/sync.ts';

/**
 * Setup-path cookie connect for accounts without Apps Script: verifies the
 * cookie loads Classroom, saves it, and runs a full record sync from the
 * session. No synced courses are needed up front (unlike /api/rich, which
 * samples already-synced courses to match the right account slot).
 */
export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => ({}))) as { cookie?: unknown };
	let cookie: string;
	try {
		cookie = parsePastedCookie(body.cookie);
	} catch (err) {
		return json(probeErrorMessage(err), { status: 400 });
	}
	const probed = await probeSessionBase(cookie);
	if (!probed.ok) return json(probed, { status: 400 });
	const savedAt = Date.now();
	saveWebSession({ cookie: probed.cookie, authuser: probed.authuser, savedAt });
	// Fire-and-forget, but never silently: failures surface in sync status
	// and the client already receives the ticket via syncStatus().
	// (No draft to clear here: this route never creates webSessionDraft —
	// retry drafts belong to /api/rich only.)
	runSync({ full: true }).catch((err) => console.error('session sync failed', err));
	const safe = withoutCookie(probed);
	return json({ ...safe, savedAt, sync: syncStatus() });
};
