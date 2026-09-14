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

export async function rotateSession(jar: CookieJar): Promise<boolean> {
	const res = await fetch('https://accounts.google.com/RotateCookies', {
		method: 'POST',
		headers: { cookie: jar.cookie, 'user-agent': UA, 'content-type': 'application/json' },
		body: '[000,"-0000000000000000000"]',
		redirect: 'manual',
		signal: AbortSignal.timeout(30_000)
	});
	const before = jar.cookie;
	absorb(jar, res);
	if (res.status >= 300 && res.status < 400) {
		const to = res.headers.get('location') ?? '';
		if (/accounts\.google\.com\/(ServiceLogin|v3\/signin)/.test(to))
			throw new SessionError('Google asked for a sign-in.');
	}
	if (!res.ok && res.status !== 302) throw new Error(`RotateCookies responded ${res.status}`);
	return jar.cookie !== before;
}

const FIELD_MASK =
	'[[[1,1,1,1,1,null,null,[1,1,1,null,1,1,1],1,1,1,1,1,1,null,null,null,null,1,null,null,null,1,[1],1,[null,null,1,1,1,null,1]],[1,1,1,1,1,1,[1],1,null,[1,1],1,1,null,1,[[1,1,[],[null,1]],1,1],null,null,null,1],[null,1],null,[1,1]],[[1,1,1,1,1,null,null,[1,1,1,null,1,1,1],1,1,1,1,1,1,null,null,null,null,1,null,null,null,1,[1],1,[null,null,1,1,1,null,1]]],[[1,1,1,1,1,null,null,[1,1,1,null,1,1,1],1,1,1,1,1,1,null,null,null,null,1,null,null,null,1,[1],1,[null,null,1,1,1,null,1]],[1,1,1,1,1,1,[1],1,null,[1,1],1,1,null,1,[[1,1,[],[null,1]],1,1],null,null,null,1],[1]],null,null,[[1,1,1,1,1,null,null,[1,1,1,null,1,1,1],1,1,1,1,1,1,null,null,null,null,1,null,null,null,1,[1],1,[null,null,1,1,1,null,1]]]]';

export function buildStreamArgs(courseId: string, pageSize: number, token?: string): string {
	return `[[${pageSize},${token ? JSON.stringify(token) : 'null'},1,0],${FIELD_MASK},[[[2,3],[[${courseId}]],null,[2]]]]`;
}

export function buildProfileArgs(ids: string[]): string {
	const list = ids.map((id) => `[null,[${id}]]`).join(',');
	return `[[null,null,1,0],[1,1,null,1,null,1,null,null,1,1,1,1,null,null,1],[[null,[${list}]]]]`;
}

export const encodeCourseId = (courseId: string) => Buffer.from(courseId).toString('base64');

export async function loadTokens(jar: CookieJar, authuser: number): Promise<WebTokens> {
	const res = await fetch(`${ORIGIN}/u/${authuser}/h`, {
		headers: { cookie: jar.cookie, 'user-agent': UA, accept: 'text/html' },
		redirect: 'manual',
		signal: AbortSignal.timeout(30_000)
	});
	absorb(jar, res);
	if (res.status >= 300 && res.status < 400) {
		const to = res.headers.get('location') ?? '';
		if (/accounts\.google\.com/.test(to)) throw new SessionError('Google asked for a sign-in.');
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

type Json = null | boolean | number | string | Json[];

async function callRpc(
	jar: CookieJar,
	authuser: number,
	tokens: WebTokens,
	rpc: string,
	args: string,
	path: string,
	capture?: RawCapture[]
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
			cookie: jar.cookie,
			'user-agent': UA,
			'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
			origin: ORIGIN,
			referer: ORIGIN + path,
			'x-same-domain': '1'
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
	if (!Array.isArray(payload)) throw new Error('Classroom stream payload is not a list');
	const flag = payload[1];
	const hasMore = Array.isArray(flag) && flag[0] === true;
	const tokenBox = Array.isArray(flag) ? flag[1] : undefined;
	const token =
		Array.isArray(tokenBox) && typeof tokenBox[0] === 'string' ? tokenBox[0] : undefined;
	const entries = Array.isArray(payload[2]) ? payload[2] : [];
	const items: StreamItem[] = [];
	for (const entry of entries) {
		const item = findItem(entry);
		if (!item) continue;
		const key = item[0] as Json[];
		const course = key[1];
		const courseId = Array.isArray(course) && typeof course[0] === 'string' ? course[0] : '';
		const creator = item[4];
		const creatorId =
			Array.isArray(creator) && typeof creator[0] === 'string' ? creator[0] : undefined;
		const rich = findRichText(item);
		if (!rich) continue;
		items.push({ id: key[0] as string, courseId, text: rich.text, html: rich.html, creatorId });
	}
	return { items, hasMore, token };
}

export function parseProfilesPayload(payload: Json): WebProfile[] {
	if (!Array.isArray(payload) || !Array.isArray(payload[2])) return [];
	const out: WebProfile[] = [];
	for (const entry of payload[2]) {
		if (!Array.isArray(entry)) continue;
		const key = entry[0];
		if (!Array.isArray(key) || typeof key[0] !== 'string') continue;
		const str = (v: Json) => (typeof v === 'string' && v ? v : undefined);
		const photo = str(entry[4]);
		out.push({
			id: key[0],
			name: str(entry[1]),
			email: str(entry[2]),
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
