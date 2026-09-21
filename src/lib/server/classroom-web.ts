import { createHash } from 'node:crypto';
import { decode, type Json } from './classroom/proto';
import {
	MEMBERS,
	PostItem,
	ProfileEntry,
	ProfilesEnvelope,
	StreamEnvelope
} from './classroom/schema';

const ORIGIN = 'https://classroom.google.com';
const STREAM_RPC = 'pONvgf';
const PROFILE_RPC = 'UG41I';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

export type WebTokens = { at: string; fsid: string; bl: string; email?: string };

export type RawCapture = { status: number; head: string };

export type StreamItem = {
	id: string;
	courseId: string;
	text: string;
	html?: string;
	creatorId?: string;
	/** Definitive bucket from {@link parsePostMeta}; unknown shapes default to announcement. */
	kind: StreamKind;
	title?: string;
	/**
	 * Creation timestamp from the PostItem slot. The stream payload exposes
	 * no reliable update time, so there is deliberately no updatedAt here —
	 * edits surface on full syncs (and text/author edits via enrichment),
	 * not on incremental `since` filters.
	 */
	createdAt?: number;
};
export type StreamPage = { items: StreamItem[]; hasMore: boolean; token?: string };

export type WebProfile = { id: string; name?: string; email?: string; photoUrl?: string };

export class SessionError extends Error {}

export class RedirectError extends SessionError {
	constructor(
		message: string,
		public readonly location: string
	) {
		super(message);
		this.name = 'RedirectError';
	}
}

export const isSlotExhausted = (err: unknown): boolean => err instanceof RedirectError;

export type CookieJar = { cookie: string; onChange?: (cookie: string) => void };

export function mergeCookies(cookie: string, setCookies: string[]): string {
	const order: string[] = [];
	const values = new Map<string, string>();
	for (const part of cookie.split(';')) {
		const i = part.indexOf('=');
		if (i < 0) continue;
		const name = part.slice(0, i).trim();
		if (!name) continue;
		if (!values.has(name)) order.push(name);
		values.set(name, part.slice(i + 1).trim());
	}
	for (const header of setCookies) {
		const [pair, ...attrs] = header.split(';');
		const i = pair.indexOf('=');
		if (i < 0) continue;
		const name = pair.slice(0, i).trim();
		const value = pair.slice(i + 1).trim();
		const expired = attrs.some((a) => {
			const [k, v] = a.split('=').map((s) => s.trim().toLowerCase());
			return (k === 'max-age' && Number(v) <= 0) || (k === 'expires' && Date.parse(v) < Date.now());
		});
		if (expired) {
			values.delete(name);
			continue;
		}
		if (!values.has(name)) order.push(name);
		values.set(name, value);
	}
	return order
		.filter((n) => values.has(n))
		.map((n) => `${n}=${values.get(n)}`)
		.join('; ');
}

function absorb(jar: CookieJar, res: Response) {
	const set = res.headers.getSetCookie();
	if (set.length === 0) return;
	const next = mergeCookies(jar.cookie, set);
	if (next === jar.cookie) return;
	jar.cookie = next;
	jar.onChange?.(next);
}

// Headers that a signed-in Chrome 129 on macOS sends. Google's session
// heuristics compare these against the browser that minted the cookie; a
// bare user-agent with no client hints looks like a scripted client.
// Note: the TLS ClientHello (JA3/JA4) cannot be shaped from Bun's fetch, so
// this only aligns the HTTP-level fingerprint.
const CLIENT_HINTS = {
	'user-agent': UA,
	'sec-ch-ua': '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
	'sec-ch-ua-mobile': '?0',
	'sec-ch-ua-platform': '"macOS"',
	'accept-language': 'en-GB,en;q=0.9'
};

const DOCUMENT_HEADERS = {
	...CLIENT_HINTS,
	accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
	'sec-fetch-site': 'none',
	'sec-fetch-mode': 'navigate',
	'sec-fetch-dest': 'document',
	'sec-fetch-user': '?1',
	'upgrade-insecure-requests': '1'
};

const XHR_HEADERS = {
	...CLIENT_HINTS,
	accept: '*/*',
	'sec-fetch-site': 'same-origin',
	'sec-fetch-mode': 'cors',
	'sec-fetch-dest': 'empty'
};

/**
 * Refreshes the short-lived SIDCC / __Secure-*PSIDCC cookies with a plain
 * Classroom page fetch; the jar absorbs the Set-Cookie headers.
 */
export async function refreshSession(jar: CookieJar, authuser: number): Promise<boolean> {
	const before = jar.cookie;
	await fetchHomeHtml(jar, authuser);
	return jar.cookie !== before;
}

export type Rotation = { rotated: boolean; nextSeconds: number };

/**
 * Rotates the device-session cookies (__Secure-1PSIDTS / 3PSIDTS) the way
 * Chrome's background timer does. As of 2026-09 Google authenticates this
 * endpoint by cookies alone, with no device-bound challenge, for both Chrome
 * and Firefox sessions; the earlier failure here came from omitting the
 * same-origin Origin header, which makes the request look cross-site.
 * The response body `[["identity.hfcr", 600], ...]` names the next interval.
 * Prior art: teng-lin/notebooklm-py#345.
 */
export async function rotateSession(jar: CookieJar): Promise<Rotation> {
	const res = await fetch('https://accounts.google.com/RotateCookies', {
		method: 'POST',
		headers: {
			...CLIENT_HINTS,
			cookie: jar.cookie,
			'content-type': 'application/json',
			origin: 'https://accounts.google.com',
			referer: 'https://accounts.google.com/RotateCookiesPage',
			'sec-fetch-site': 'same-origin',
			'sec-fetch-mode': 'cors',
			'sec-fetch-dest': 'empty'
		},
		body: '[000,"-0000000000000000000"]',
		redirect: 'manual',
		signal: AbortSignal.timeout(30_000)
	});
	const before = jar.cookie;
	absorb(jar, res);
	if (res.status >= 300 && res.status < 400) {
		const to = res.headers.get('location') ?? '';
		if (/ServiceLogin|\/v3\/signin/.test(to))
			throw new SessionError('Google asked for a sign-in when rotating the device cookies.');
	}
	if (res.status === 429) return { rotated: false, nextSeconds: 600 };
	if (!res.ok) throw new Error(`RotateCookies responded ${res.status}`);
	const text = await res.text();
	const next = Number(text.match(/"identity\.hfcr",\s*(\d+)/)?.[1] ?? 600);
	return { rotated: jar.cookie !== before, nextSeconds: Math.max(60, next) };
}

const FIELD_MASK =
	'[[[1,1,1,1,1,null,null,[1,1,1,null,1,1,1],1,1,1,1,1,1,null,null,null,null,1,null,null,null,1,[1],1,[null,null,1,1,1,null,1]],[1,1,1,1,1,1,[1],1,null,[1,1],1,1,null,1,[[1,1,[],[null,1]],1,1],null,null,null,1],[null,1],null,[1,1]],[[1,1,1,1,1,null,null,[1,1,1,null,1,1,1],1,1,1,1,1,1,null,null,null,null,1,null,null,null,1,[1],1,[null,null,1,1,1,null,1]]],[[1,1,1,1,1,null,null,[1,1,1,null,1,1,1],1,1,1,1,1,1,null,null,null,null,1,null,null,null,1,[1],1,[null,null,1,1,1,null,1]],[1,1,1,1,1,1,[1],1,null,[1,1],1,1,null,1,[[1,1,[],[null,1]],1,1],null,null,null,1],[1]],null,null,[[1,1,1,1,1,null,null,[1,1,1,null,1,1,1],1,1,1,1,1,1,null,null,null,null,1,null,null,null,1,[1],1,[null,null,1,1,1,null,1]]]]';

export function buildStreamArgs(courseId: string, pageSize: number, token?: string): string {
	return `[[${pageSize},${token ? JSON.stringify(token) : 'null'},1,0],${FIELD_MASK},[[[2,3],[[${courseId}]],null,[2]]]]`;
}

const COURSE_RPC = 'gXtzob';

export function buildMembersArgs(courseId: string): string {
	return `[[null,null,1,0],[null,1,null,null,null,null,1,null,null,null,null,null,null,null,null,null,null,1,null,null,null,null,1,null,null,null,null,null,null,null,null,1,1,null,null,null,null,null,null,null,null,[1,null,1,1,1,1,1,0,0,1],null,null,null,null,null,null,null,null,null,1,1],[null,[[${courseId}]],null,null,null,null,[1,2]]]`;
}

export type CourseMembers = { students: string[]; teachers: string[] };

export async function fetchCourseMembers(
	jar: CookieJar,
	authuser: number,
	tokens: WebTokens,
	courseId: string
): Promise<CourseMembers> {
	const payload = await callRpc(
		jar,
		authuser,
		tokens,
		COURSE_RPC,
		buildMembersArgs(courseId),
		`/u/${authuser}/r/${encodeCourseId(courseId)}/sort-last-name`
	);
	return parseMembersPayload(payload);
}

export function parseMembersPayload(payload: Json): CourseMembers {
	const out: CourseMembers = { students: [], teachers: [] };
	if (!Array.isArray(payload) || !Array.isArray(payload[2])) return out;
	const record = payload[2][0];
	if (!Array.isArray(record)) return out;
	const box = record[3];
	if (!box || typeof box !== 'object' || Array.isArray(box)) return out;
	const ids = (v: unknown) =>
		Array.isArray(v)
			? v
					.filter((x): x is string[] => Array.isArray(x) && typeof x[0] === 'string')
					.map((x) => x[0])
			: [];
	const fields = box as Record<string, unknown>;
	out.students = ids(fields[MEMBERS.students]);
	out.teachers = ids(fields[MEMBERS.teachers]);
	return out;
}

export function buildProfileArgs(ids: string[]): string {
	const list = ids.map((id) => `[null,[${id}]]`).join(',');
	return `[[null,null,1,0],[1,1,null,1,null,1,null,null,1,1,1,1,null,null,1],[[null,[${list}]]]]`;
}

export const encodeCourseId = (courseId: string) => Buffer.from(courseId).toString('base64');

/**
 * Fetches the signed-in Classroom home page and returns its HTML. The page
 * embeds the course list (AF_initDataCallback payloads), so a cookie-only
 * record source can discover courses without a separate list RPC.
 *
 * Follows Classroom-internal redirects like a browser: /h currently bounces
 * to a role-specific sub-page (observed /u/0/h/st), sometimes via HTTP 3xx
 * and sometimes via a client-side hop (meta refresh / location.replace) on
 * an HTTP-200 shell that already carries sign-in tokens but no course cards.
 * Stopping at the shell is what produced "signed in but no courses found".
 */
export async function fetchHomeHtml(jar: CookieJar, authuser: number): Promise<string> {
	let path = `/u/${authuser}/h`;
	for (let hop = 0; hop < MAX_HOME_HOPS; hop++) {
		const res = await fetch(`${ORIGIN}${path}`, {
			headers: { ...DOCUMENT_HEADERS, cookie: jar.cookie },
			redirect: 'manual',
			signal: AbortSignal.timeout(30_000)
		});
		absorb(jar, res);
		if (res.status >= 300 && res.status < 400) {
			const to = res.headers.get('location') ?? '';
			if (/accounts\.google\.com/.test(to))
				throw new SessionError('Google asked for a sign-in when loading the Classroom page.');
			const next = sameOriginClassroom(to);
			if (!next) throw new RedirectError(`Classroom redirected to ${to.slice(0, 80)}`, to);
			path = next;
			continue;
		}
		if (!res.ok) throw new SessionError(`Classroom responded ${res.status}`);
		const html = await res.text();
		const next = findHomeRedirect(html);
		if (next && next !== path) {
			path = next;
			continue;
		}
		return html;
	}
	throw new SessionError('Classroom kept redirecting the home page; please report it.');
}

const MAX_HOME_HOPS = 5;

/** Same-origin Classroom home path for a redirect target, or null to not follow. */
function sameOriginClassroom(to: string): string | null {
	try {
		const url = new URL(to, ORIGIN);
		if (url.origin !== ORIGIN) return null;
		// Only home pages: a hop to a course/rpc path is not the course list.
		if (!/^\/u\/\d+\/h(\/|$)/.test(url.pathname) && url.pathname !== '/h') return null;
		return url.pathname + url.search;
	} catch {
		return null;
	}
}

/**
 * Client-side hop out of an HTTP-200 shell page: meta refresh,
 * location.replace/assign/href, or an embedded redirectUrl. Pure so the
 * redirect patterns are unit-testable; only same-origin Classroom paths are
 * ever returned.
 */
export function findHomeRedirect(html: string): string | null {
	const meta = html.match(
		/<meta[^>]+http-equiv=["']?refresh["']?[^>]*content=["']?\d+\s*;\s*url=([^"'\s>]+)/i
	)?.[1];
	if (meta) {
		const next = sameOriginClassroom(meta.trim());
		if (next) return next;
	}
	const js =
		html.match(
			/(?:location\.replace|location\.assign|location\.href\s*=|window\.location\s*=)\s*\(\s*["']([^"']+)["']/
		)?.[1] ??
		html.match(/(?:location\.href|window\.location)\s*=\s*["']([^"']+)["']/)?.[1] ??
		html.match(/"redirectUrl"\s*:\s*"([^"]+)"/)?.[1];
	if (js) {
		// Embedded URLs escape slashes as \/ — unescape before parsing.
		const next = sameOriginClassroom(js.replace(/\\\//g, '/'));
		if (next) return next;
	}
	return null;
}

export function parseTokens(html: string): WebTokens {
	const pick = (key: string) => html.match(new RegExp(`"${key}":"([^"]*)"`))?.[1];
	const at = pick('SNlM0e');
	const fsid = pick('FdrFJe');
	const bl = pick('cfb2h');
	if (!at || !fsid || !bl)
		throw new SessionError('Signed-in Classroom page did not load. Check the cookie.');
	const wiz = html.match(/WIZ_global_data\s*=\s*\{([\s\S]*?)\};/)?.[1] ?? '';
	const email = wiz.match(/"([\w.+-]+@[\w-]+(?:\.[\w-]+)+)"/)?.[1];
	return { at, fsid, bl, email };
}

async function callRpc(
	jar: CookieJar,
	authuser: number,
	tokens: WebTokens,
	rpc: string,
	args: string,
	path: string,
	capture?: RawCapture[],
	headers: Record<string, string> = {}
): Promise<Json> {
	const url = new URL(`${ORIGIN}/u/${authuser}/_/ClassroomUi/data/batchexecute`);
	url.searchParams.set('rpcids', rpc);
	url.searchParams.set('source-path', path);
	url.searchParams.set('f.sid', tokens.fsid);
	url.searchParams.set('bl', tokens.bl);
	url.searchParams.set('hl', 'en');
	url.searchParams.set('soc-app', '1');
	url.searchParams.set('soc-platform', '1');
	url.searchParams.set('soc-device', '1');
	url.searchParams.set('_reqid', String(100000 + Math.floor(Math.random() * 900000)));
	url.searchParams.set('rt', 'c');
	const freq = JSON.stringify([[[rpc, args, null, 'generic']]]);
	const body = `f.req=${encodeURIComponent(freq)}&at=${encodeURIComponent(tokens.at)}&`;
	const res = await fetch(url, {
		method: 'POST',
		headers: {
			...XHR_HEADERS,
			cookie: jar.cookie,
			'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
			origin: ORIGIN,
			referer: ORIGIN + path,
			'x-same-domain': '1',
			...headers
		},
		body,
		redirect: 'manual',
		signal: AbortSignal.timeout(60_000)
	});
	absorb(jar, res);
	const text = await res.text();
	capture?.push({ status: res.status, head: text.replace(/\s+/g, ' ').slice(0, 600) });
	if (res.status === 401 || res.status === 403 || (res.status >= 300 && res.status < 400))
		throw new SessionError(`Classroom rejected the session (${res.status}).`);
	if (!res.ok) throw new Error(`Classroom responded ${res.status}`);
	return extractPayload(text, rpc);
}

export const STREAM_PAGE_SIZE = 50;
export const STREAM_MAX_PAGES = 60;

export async function fetchStreamPage(
	jar: CookieJar,
	authuser: number,
	tokens: WebTokens,
	courseId: string,
	pageSize = STREAM_PAGE_SIZE,
	token?: string,
	capture?: RawCapture[]
): Promise<StreamPage> {
	const payload = await callRpc(
		jar,
		authuser,
		tokens,
		STREAM_RPC,
		buildStreamArgs(courseId, pageSize, token),
		`/u/${authuser}/c/${encodeCourseId(courseId)}`,
		capture
	);
	return parseStreamPayload(payload);
}

export async function fetchProfiles(
	jar: CookieJar,
	authuser: number,
	tokens: WebTokens,
	ids: string[]
): Promise<WebProfile[]> {
	if (ids.length === 0) return [];
	const payload = await callRpc(
		jar,
		authuser,
		tokens,
		PROFILE_RPC,
		buildProfileArgs(ids),
		`/u/${authuser}/h`
	);
	return parseProfilesPayload(payload);
}

// ---- submissions (RPC CVt8yf, HomeroomDataService.WriteSubmission) --------
//
// Wire format from a real hand-in capture, then confirmed live (2026-09-15).
// A submission is keyed by [studentWebId, [workId, [courseId]]]; the student
// id is the web-namespace id the profiles RPC returns, matched by email.
// The write echoes the resulting record, so no separate query is needed
// (Google rejects QuerySubmission replays from this session with code 3).
// The request must carry the course in x-goog-ext-53200201-jspb.

const SUBMISSION_RPC = 'CVt8yf';

const SUBMISSION_MASK =
	'[null,1,null,1,1,null,1,1,1,null,null,null,1,null,[1],null,null,null,1,1,1,null,null,null,[[1,1]],[[1,1]],[1,[[1,1,[],[null,1,1]],1,1,1]],null,null,null,null,1]';

// Control proto: field 1 = turn in, field 2 = save attachments. Field 13 is
// set alongside turn-in in every capture.
const TURN_IN_CONTROL = '[1,null,null,null,null,null,null,null,null,null,null,null,1]';

export type WebSubmission = {
	turnedIn: boolean;
	turnedInAt?: number;
	attachments: { title?: string; driveId?: string; url?: string }[];
};

function submissionContext(courseId: string) {
	return {
		'x-goog-ext-174067345-jspb': '[[1]]',
		'x-goog-ext-53200201-jspb': `[{"444624357":[${courseId}]}]`
	};
}

export type SubmissionVerb = 'turnIn' | 'reclaim';

/**
 * Submission state field 6: 2 = turned in, 5 = reclaimed by the student.
 * Turn-in also sets field 33 and control field 13; reclaim sends control
 * field 1 alone. Both captured from the web app on 2026-09-15.
 */
export async function writeSubmissionState(
	verb: SubmissionVerb,
	jar: CookieJar,
	authuser: number,
	tokens: WebTokens,
	studentId: string,
	workId: string,
	courseId: string,
	capture?: RawCapture[]
): Promise<WebSubmission> {
	const key = `[${studentId},[${workId},[${courseId}]]]`;
	let submission: string;
	let control: string;
	if (verb === 'turnIn') {
		const fields = new Array<string>(33).fill('null');
		fields[0] = key;
		fields[5] = '2';
		fields[32] = '1';
		submission = `[${fields.join(',')}]`;
		control = TURN_IN_CONTROL;
	} else {
		submission = `[${key},null,null,null,null,5]`;
		control = '[1]';
	}
	const args = `[[3],[[${key},${submission},${control}]],${SUBMISSION_MASK}]`;
	const payload = await callRpc(
		jar,
		authuser,
		tokens,
		SUBMISSION_RPC,
		args,
		`/u/${authuser}/c/${encodeCourseId(courseId)}/a/${encodeCourseId(workId)}/details`,
		capture,
		submissionContext(courseId)
	);
	return parseSubmission(payload);
}

// ---- attachments -----------------------------------------------------------
//
// Files go to Drive first through the same resumable upload the web app's
// picker uses (cookie + x-goog-authuser, no OAuth token), then WriteSubmission
// with the "save attachments" control lists the Drive id. Removal re-sends
// the spec with its trailing flag set to 2. All live-confirmed 2026-09-15.

const DRIVE_UPLOAD =
	'https://clients6.google.com/upload/drive/v2internal/files?uploadType=resumable&supportsTeamDrives=true&OriginatorHint=CLASSROOM&fields=id%2Ctitle%2CmimeType&key=AIzaSyAw-cTyp9Xotzvu3vNDWhDU3E9NConkKxQ';

export type WebAttachment = { title?: string; driveId: string; mime: string; url?: string };

export async function querySubmissionAttachments(
	jar: CookieJar,
	authuser: number,
	tokens: WebTokens,
	workId: string,
	courseId: string
): Promise<WebAttachment[]> {
	const payload = await callRpc(
		jar,
		authuser,
		tokens,
		'Zj93ge',
		`[[null,null,2,0],${SUBMISSION_MASK},[null,[[${workId},[${courseId}]]],null]]`,
		`/u/${authuser}/c/${encodeCourseId(courseId)}/a/${encodeCourseId(workId)}/details`,
		undefined,
		submissionContext(courseId)
	);
	const record = Array.isArray(payload) && Array.isArray(payload[2]) ? payload[2][0] : null;
	if (!Array.isArray(record) || !Array.isArray(record[4])) return [];
	return record[4]
		.filter((a): a is Json[] => Array.isArray(a) && typeof a[2] === 'string')
		.map((a) => ({
			title: typeof a[0] === 'string' ? a[0] : undefined,
			driveId: a[2] as string,
			mime: typeof a[4] === 'string' ? a[4] : 'application/octet-stream',
			url: typeof a[6] === 'string' ? a[6] : undefined
		}));
}

export async function uploadToDrive(
	jar: CookieJar,
	authuser: number,
	file: { name: string; type: string; bytes: Uint8Array }
): Promise<{ id: string }> {
	// clients6 authenticates a cookie session by SAPISIDHASH: sha1 of
	// "<unix seconds> <SAPISID> <origin>", which HAR exports do not show.
	const sapisid = jar.cookie.match(/(?:^|;\s*)SAPISID=([^;]+)/)?.[1];
	if (!sapisid) throw new SessionError('The saved cookie has no SAPISID.');
	const origin = 'https://drive.google.com';
	const ts = Math.floor(Date.now() / 1000);
	const digest = createHash('sha1').update(`${ts} ${sapisid} ${origin}`).digest('hex');
	const common = {
		...CLIENT_HINTS,
		cookie: jar.cookie,
		origin,
		referer: `${origin}/`,
		authorization: `SAPISIDHASH ${ts}_${digest}`,
		'x-goog-authuser': String(authuser),
		'x-goog-ext-525001598-jspb':
			'W1s5MDcsbnVsbCxudWxsLG51bGwsMCxudWxsLG51bGwsIkNMQVNTUk9PTSIsbnVsbCxudWxsLG51bGwsWzJdXV0='
	};
	const init = await fetch(DRIVE_UPLOAD, {
		method: 'POST',
		headers: {
			...common,
			'content-type': 'application/json',
			'x-upload-content-type': file.type,
			'x-upload-content-length': String(file.bytes.byteLength)
		},
		body: JSON.stringify({
			title: file.name,
			mimeType: file.type,
			modifiedDate: new Date().toISOString()
		}),
		signal: AbortSignal.timeout(60_000)
	});
	absorb(jar, init);
	const location = init.headers.get('location');
	if (!init.ok || !location) throw new Error(`Drive upload init failed (${init.status})`);
	const put = await fetch(location, {
		method: 'PUT',
		headers: {
			...common,
			'content-type': file.type,
			'content-range': `bytes 0-${file.bytes.byteLength - 1}/${file.bytes.byteLength}`
		},
		body: new Blob([file.bytes as Uint8Array<ArrayBuffer>], { type: file.type }),
		signal: AbortSignal.timeout(300_000)
	});
	absorb(jar, put);
	if (!put.ok) throw new Error(`Drive upload failed (${put.status})`);
	const meta = (await put.json()) as { id?: string };
	if (!meta.id) throw new Error('Drive upload returned no file id');
	return { id: meta.id };
}

const attachmentSpec = (f: { driveId: string; mime: string }) =>
	`[null,null,${JSON.stringify(f.driveId)},2,${JSON.stringify(f.mime)},null,null,1,null,null,null,null,null,null,[null,2],null,null,null,null,null,1]`;

/**
 * Replaces the submission's attachment list with `files`. Only applies while
 * the submission is not turned in; the echoed record is not trustworthy, so
 * callers read back with querySubmissionAttachments.
 */
export async function writeAttachments(
	jar: CookieJar,
	authuser: number,
	tokens: WebTokens,
	studentId: string,
	workId: string,
	courseId: string,
	files: { driveId: string; mime: string }[]
): Promise<WebSubmission> {
	const key = `[${studentId},[${workId},[${courseId}]]]`;
	const submission = `[${key},null,null,null,[${files.map(attachmentSpec).join(',')}]]`;
	const args = `[[3],[[${key},${submission},[null,1]]],${SUBMISSION_MASK}]`;
	const payload = await callRpc(
		jar,
		authuser,
		tokens,
		SUBMISSION_RPC,
		args,
		`/u/${authuser}/c/${encodeCourseId(courseId)}/a/${encodeCourseId(workId)}/details`,
		undefined,
		submissionContext(courseId)
	);
	return parseSubmission(payload);
}

// ---- private comments (RPCs sLc6hf QueryComment / jOFnxd WriteComment) ----
//
// Comment key: [commentId|null, null, submissionKey, 3]; 3 = private comment
// on a submission. Captured from the web app on 2026-09-15.

const COMMENT_QUERY_RPC = 'sLc6hf';
const COMMENT_WRITE_RPC = 'jOFnxd';
const COMMENT_MASK = '[1,1,1,1,null,null,[1],1,null,3,[1,null,1]]';

export type WebComment = {
	id: string;
	authorId: string;
	text: string;
	html?: string;
	createdAt?: number;
};

const escapeHtml = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function commentProto(commentKey: string, authorId: string, text: string) {
	const rich = JSON.stringify(['edu.rt', text, null, null, [null, escapeHtml(text)]]);
	return `[${commentKey},null,null,null,[${authorId}],null,null,null,[1],null,null,${rich}]`;
}

export async function listComments(
	jar: CookieJar,
	authuser: number,
	tokens: WebTokens,
	studentId: string,
	workId: string,
	courseId: string
): Promise<WebComment[]> {
	const key = `[${studentId},[${workId},[${courseId}]]]`;
	const payload = await callRpc(
		jar,
		authuser,
		tokens,
		COMMENT_QUERY_RPC,
		`[[null,null,2,0],${COMMENT_MASK},[null,null,null,[${key}]]]`,
		`/u/${authuser}/c/${encodeCourseId(courseId)}/a/${encodeCourseId(workId)}/details`,
		undefined,
		submissionContext(courseId)
	);
	const entries = Array.isArray(payload) && Array.isArray(payload[2]) ? payload[2] : [];
	return entries.map(parseComment).filter((c): c is WebComment => c !== null);
}

export async function writeComment(
	verb: 'create' | 'delete',
	jar: CookieJar,
	authuser: number,
	tokens: WebTokens,
	studentId: string,
	workId: string,
	courseId: string,
	text: string,
	commentId?: string
): Promise<WebComment | null> {
	const key = `[${studentId},[${workId},[${courseId}]]]`;
	const commentKey = `[${commentId ?? 'null'},null,${key},3]`;
	const args = `[[${verb === 'create' ? 2 : 4}],[[${commentKey},${commentProto(commentKey, studentId, text)}]],${COMMENT_MASK}]`;
	const payload = await callRpc(
		jar,
		authuser,
		tokens,
		COMMENT_WRITE_RPC,
		args,
		`/u/${authuser}/c/${encodeCourseId(courseId)}/a/${encodeCourseId(workId)}/details`,
		undefined,
		submissionContext(courseId)
	);
	const record = Array.isArray(payload) && Array.isArray(payload[1]) ? payload[1][0] : null;
	return parseComment(record as Json);
}

function parseComment(node: Json): WebComment | null {
	if (!Array.isArray(node)) return null;
	const head = node[0];
	if (!Array.isArray(head) || head[0] == null) return null;
	const rich = node.find((v) => Array.isArray(v) && v[0] === 'edu.rt') as Json[] | undefined;
	const author = Array.isArray(node[4]) ? node[4][0] : undefined;
	let createdAt: number | undefined;
	for (const v of node.slice(1, 4)) {
		const ts = asMsTimestamp(v);
		if (ts !== undefined) {
			createdAt = ts;
			break;
		}
	}
	const box = rich?.[4];
	return {
		id: String(head[0]),
		authorId: author != null ? String(author) : '',
		text: typeof rich?.[1] === 'string' ? rich[1] : '',
		html: Array.isArray(box) && typeof box[1] === 'string' ? box[1] : undefined,
		createdAt
	};
}

/** Response is `["hrw.sub", [record]]`; record[5] === 2 with record[21] a
 *  timestamp means turned in; record[4] lists attachments. */
function parseSubmission(payload: Json): WebSubmission {
	const record = Array.isArray(payload) && Array.isArray(payload[1]) ? payload[1][0] : null;
	if (!Array.isArray(record)) throw new Error('WriteSubmission returned no record');
	const attachments: WebSubmission['attachments'] = [];
	if (Array.isArray(record[4]))
		for (const a of record[4]) {
			if (!Array.isArray(a)) continue;
			attachments.push({
				title: typeof a[0] === 'string' ? a[0] : undefined,
				driveId: typeof a[2] === 'string' ? a[2] : undefined,
				url: typeof a[6] === 'string' ? a[6] : undefined
			});
		}
	const turnedInAt = typeof record[21] === 'number' ? record[21] : undefined;
	return { turnedIn: record[5] === 2 && turnedInAt !== undefined, turnedInAt, attachments };
}

const RPC_STATUS: Record<number, string> = {
	3: 'rejected the request',
	5: 'could not find that item',
	7: 'refused permission',
	16: 'no longer accepts the saved session'
};

function describeRpcError(entry: Json[]): string {
	const status = entry[5];
	const code = Array.isArray(status) && typeof status[0] === 'number' ? status[0] : undefined;
	const statusMessage =
		Array.isArray(status) && typeof status[1] === 'string' ? status[1] : undefined;
	const details = Array.isArray(status) ? status[2] : undefined;
	const errorDetail =
		Array.isArray(details) && Array.isArray(details[0]) && Array.isArray(details[0][1])
			? details[0][1][1]
			: undefined;
	const what = code !== undefined ? RPC_STATUS[code] : undefined;
	const tail = [
		code !== undefined && `code ${code}`,
		statusMessage && `status ${statusMessage}`,
		errorDetail !== undefined && `detail ${errorDetail}`
	]
		.filter(Boolean)
		.join(', ');
	return what
		? `Classroom ${what} (${tail}).`
		: `Classroom RPC failed: ${JSON.stringify(entry.slice(2, 7)).slice(0, 200)}`;
}

export function extractPayload(text: string, rpc: string): Json {
	const lines = text.replace(/^\)\]\}'/, '').split('\n');
	let payload: Json | undefined;
	for (const line of lines) {
		if (!line.startsWith('[[')) continue;
		let parsed: Json;
		try {
			parsed = JSON.parse(line) as Json;
		} catch {
			continue;
		}
		if (!Array.isArray(parsed)) continue;
		for (const entry of parsed) {
			if (!Array.isArray(entry) || entry[0] !== 'wrb.fr' || entry[1] !== rpc) continue;
			if (typeof entry[2] !== 'string') throw new Error(describeRpcError(entry));
			payload = JSON.parse(entry[2]) as Json;
		}
	}
	if (payload === undefined) throw new Error('Classroom RPC returned no payload');
	return payload;
}

export const parseStreamResponse = (text: string) =>
	parseStreamPayload(extractPayload(text, STREAM_RPC));

const ENTRY_ANNOUNCEMENT = 3;
const ENTRY_WORK_OR_MATERIAL = 2;

// Only two buckets: announcements, and titled wrapper-2 entries as
// best-effort courseWork. Titled materials share the wrapper-2 shape, and
// due dates, points and grades live deeper in the payload and are still
// unmapped — there is deliberately no 'material' kind until a HAR capture
// distinguishes the two.
export type StreamKind = 'announcement' | 'courseWork';

const asNonEmptyString = (value: unknown): string | undefined =>
	typeof value === 'string' && value ? value : undefined;

// Millisecond epoch timestamps are 13 digits; anything smaller is a
// different slot (counter, type tag), not a creation time.
export const MIN_MS_EPOCH = 1e12;

export const asMsTimestamp = (value: unknown): number | undefined =>
	typeof value === 'number' && Number.isFinite(value) && value > MIN_MS_EPOCH ? value : undefined;

/**
 * Single coercion point for the stream entry wrapper plus the raw PostItem
 * title/timestamp slots. Announcements arrive as entry `[3, null, [PostItem]]`,
 * assignments and materials as `[2, [PostItem]]`; only a non-empty string in
 * the title slot counts as a title (announcements carry an array there).
 * Wrapper 2 with a title is best-effort courseWork — titled materials share
 * the shape, and due dates, points and grades live deeper in the payload and
 * are still unmapped. Anything else defaults to announcement so consumers
 * never branch on undefined.
 *
 * Pure by design: unexpected shapes report through `onFallback` instead of
 * logging directly, so a large sync emits one summary line per page (see
 * parseStreamPayload) rather than one line per item.
 */
export function parsePostMeta(
	wrapper: unknown,
	rawTitle: unknown,
	rawTimestamp: unknown,
	onFallback?: (info: { wrapper: unknown; title?: string }) => void
): { kind: StreamKind; title?: string; createdAt?: number } {
	const title = asNonEmptyString(rawTitle);
	const createdAt = asMsTimestamp(rawTimestamp);
	if (wrapper === ENTRY_ANNOUNCEMENT) return { kind: 'announcement', title, createdAt };
	if (wrapper === ENTRY_WORK_OR_MATERIAL && title) return { kind: 'courseWork', title, createdAt };
	// Fallback is deliberately announcement so consumers never branch on
	// undefined — but it misfiles untitled wrapper-2 entries and unknown
	// wrappers, so report it: the next HAR capture starts from these lines.
	onFallback?.({ wrapper, title });
	return { kind: 'announcement', title, createdAt };
}

export function parseStreamPayload(payload: Json): StreamPage {
	const env = decode(payload, StreamEnvelope);
	if (!env) throw new Error('Classroom stream payload is not a list');
	const items: StreamItem[] = [];
	const fallbacks = new Map<string, number>();
	for (const entry of env.entries ?? []) {
		const located = findItem(entry as Json);
		if (!located) continue;
		const item = decode(located, PostItem);
		const rich = findRichText(located);
		if (!item?.key || !rich) continue;
		const wrapper = Array.isArray(entry) ? entry[0] : undefined;
		const { kind, title, createdAt } = parsePostMeta(wrapper, item.rawTitle, item.rawTimestamp, (info) => {
			const key = `wrapper=${JSON.stringify(info.wrapper)}, title=${info.title === undefined ? 'none' : JSON.stringify(info.title)}`;
			fallbacks.set(key, (fallbacks.get(key) ?? 0) + 1);
		});
		items.push({
			id: item.key.id,
			courseId: item.key.course?.id ?? '',
			text: rich.text,
			html: rich.html,
			creatorId: item.creator?.id,
			kind,
			title,
			createdAt
		});
	}
	if (fallbacks.size > 0)
		console.debug(
			`parseStreamPayload: filed ${[...fallbacks.values()].reduce((a, b) => a + b, 0)} item(s) as announcement: ` +
				[...fallbacks].map(([shape, n]) => `${n}x (${shape})`).join('; ')
		);
	return {
		items,
		hasMore: env.paging?.hasMore ?? false,
		token: env.paging?.token
	};
}

export function parseProfilesPayload(payload: Json): WebProfile[] {
	const env = decode(payload, ProfilesEnvelope);
	if (!env) return [];
	const out: WebProfile[] = [];
	for (const raw of env.entries) {
		const p = decode(raw as Json, ProfileEntry);
		if (!p?.key) continue;
		const photo = p.photoUrl;
		out.push({
			id: p.key.id,
			name: p.name || undefined,
			email: p.email || undefined,
			photoUrl: photo ? (photo.startsWith('//') ? `https:${photo}` : photo) : undefined
		});
	}
	return out;
}

const isKey = (n: Json) =>
	Array.isArray(n) &&
	typeof n[0] === 'string' &&
	Array.isArray(n[1]) &&
	typeof n[1][0] === 'string';

function findItem(node: Json, depth = 0): Json[] | null {
	if (!Array.isArray(node) || depth > 3) return null;
	if (isKey(node[0])) return node;
	for (const child of node) {
		const found = findItem(child, depth + 1);
		if (found) return found;
	}
	return null;
}

function findRichText(node: Json): { text: string; html?: string } | null {
	if (!Array.isArray(node)) return null;
	if (node[0] === 'edu.rt' && typeof node[1] === 'string') {
		const box = node[4];
		const html = Array.isArray(box) && typeof box[1] === 'string' ? box[1] : undefined;
		return { text: node[1], html };
	}
	for (const child of node) {
		const found = findRichText(child);
		if (found) return found;
	}
	return null;
}
