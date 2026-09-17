import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from './config';

const ALLOWED_HOST = /^lh[0-9]\.googleusercontent\.com$/;
const SIZE = 128;
const NEGATIVE_TTL = 60 * 60_000;

type Cached = { bytes: Uint8Array; type: string; etag: string };

const memory = new Map<string, Cached>();
const failures = new Map<string, number>();
const inflight = new Map<string, Promise<Cached | null>>();

const dir = () => {
	const d = join(config.databasePath, '..', 'avatars');
	mkdirSync(d, { recursive: true });
	return d;
};

export function isAllowedAvatarUrl(raw: string) {
	try {
		const url = new URL(raw);
		return url.protocol === 'https:' && ALLOWED_HOST.test(url.hostname);
	} catch {
		return false;
	}
}

function sized(raw: string) {
	return raw.replace(/=[a-z0-9-]*$/i, '') + `=s${SIZE}-c`;
}

async function key(raw: string) {
	return createHash('sha1').update(sized(raw)).digest('hex');
}

export async function getAvatar(raw: string): Promise<Cached | null> {
	const id = await key(raw);
	const hit = memory.get(id);
	if (hit) return hit;
	const failedAt = failures.get(id);
	if (failedAt && Date.now() - failedAt < NEGATIVE_TTL) return null;
	const pending = inflight.get(id);
	if (pending) return pending;
	const task = load(id, raw).finally(() => inflight.delete(id));
	inflight.set(id, task);
	return task;
}

async function load(id: string, raw: string): Promise<Cached | null> {
	const base = join(dir(), id);
	try {
		const { type } = JSON.parse(await readFile(`${base}.json`, 'utf8')) as { type: string };
		const bytes = new Uint8Array(await readFile(base));
		const cached = { bytes, type, etag: `"${id}"` };
		memory.set(id, cached);
		return cached;
	} catch {
		// Cache miss; fall through to fetching from Google.
	}
	try {
		const res = await fetch(sized(raw), { signal: AbortSignal.timeout(10_000) });
		if (!res.ok) throw new Error(`avatar fetch ${res.status}`);
		const type = res.headers.get('content-type') ?? 'image/jpeg';
		const bytes = new Uint8Array(await res.arrayBuffer());
		await Promise.all([
			writeFile(base, bytes),
			writeFile(`${base}.json`, JSON.stringify({ type, url: sized(raw) }))
		]);
		const cached = { bytes, type, etag: `"${id}"` };
		memory.set(id, cached);
		failures.delete(id);
		return cached;
	} catch {
		failures.set(id, Date.now());
		return null;
	}
}

export async function warmAvatars(urls: Iterable<string | undefined>) {
	const unique = [...new Set([...urls].filter((u): u is string => !!u && isAllowedAvatarUrl(u)))];
	for (const url of unique) {
		const id = await key(url);
		if (memory.has(id)) continue;
		await getAvatar(url);
		await new Promise((r) => setTimeout(r, 150));
	}
}
