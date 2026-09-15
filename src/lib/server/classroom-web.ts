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
};
export type StreamPage = { items: StreamItem[]; hasMore: boolean; token?: string };

export type WebProfile = { id: string; name?: string; email?: string; photoUrl?: string };

export class SessionError extends Error {}

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
	await loadTokens(jar, authuser);
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

export async function loadTokens(jar: CookieJar, authuser: number): Promise<WebTokens> {
	const res = await fetch(`${ORIGIN}/u/${authuser}/h`, {
		headers: { ...DOCUMENT_HEADERS, cookie: jar.cookie },
		redirect: 'manual',
		signal: AbortSignal.timeout(30_000)
	});
	absorb(jar, res);
	if (res.status >= 300 && res.status < 400) {
		const to = res.headers.get('location') ?? '';
		if (/accounts\.google\.com/.test(to))
			throw new SessionError('Google asked for a sign-in when loading the Classroom page.');
		throw new SessionError(`Classroom redirected to ${to.slice(0, 80)}`);
	}
	if (!res.ok) throw new SessionError(`Classroom responded ${res.status}`);
	const html = await res.text();
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

export async function fetchStreamPage(
	jar: CookieJar,
	authuser: number,
	tokens: WebTokens,
	courseId: string,
	pageSize = 50,
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

export async function turnInSubmission(
	jar: CookieJar,
	authuser: number,
	tokens: WebTokens,
	studentId: string,
	workId: string,
	courseId: string,
	capture?: RawCapture[]
): Promise<WebSubmission> {
	const key = `[${studentId},[${workId},[${courseId}]]]`;
	const fields = new Array<string>(33).fill('null');
	fields[0] = key;
	fields[5] = '2';
	fields[32] = '1';
	const submission = `[${fields.join(',')}]`;
	const args = `[[3],[[${key},${submission},${TURN_IN_CONTROL}]],${SUBMISSION_MASK}]`;
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
			if (typeof entry[2] !== 'string')
				throw new Error(`Classroom RPC failed: ${JSON.stringify(entry.slice(2, 7)).slice(0, 200)}`);
			payload = JSON.parse(entry[2]) as Json;
		}
	}
	if (payload === undefined) throw new Error('Classroom RPC returned no payload');
	return payload;
}

export const parseStreamResponse = (text: string) =>
	parseStreamPayload(extractPayload(text, STREAM_RPC));

export function parseStreamPayload(payload: Json): StreamPage {
	const env = decode(payload, StreamEnvelope);
	if (!env) throw new Error('Classroom stream payload is not a list');
	const items: StreamItem[] = [];
	for (const entry of env.entries ?? []) {
		const located = findItem(entry as Json);
		if (!located) continue;
		const item = decode(located, PostItem);
		const rich = findRichText(located);
		if (!item?.key || !rich) continue;
		items.push({
			id: item.key.id,
			courseId: item.key.course?.id ?? '',
			text: rich.text,
			html: rich.html,
			creatorId: item.creator?.id
		});
	}
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
