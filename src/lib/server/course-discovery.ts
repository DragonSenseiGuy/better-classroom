// Course discovery from the signed-in Classroom home page HTML.
//
// Course cards link to /c/<base64 of numeric id> with the course name as
// link text; that pair is the reliable signal. A numeric-id/name pair scan
// is the fallback for markup variations.
//
// If cards change shape: capture a redacted home-page HAR, add its card
// markup as a fixture case in classroom-web.test.ts, then extend the link
// pattern.

import { decodeEntities } from '#lib/rich-html.ts';

export type WebCourse = { id: string; name: string };

// Single course-id invariant shared by both signals. Link ids arrive base64
// and pair ids arrive as digits; both must satisfy this after decoding.
export const COURSE_ID_RE = /^\d{9,15}$/;

export function parseCoursesHtml(html: string): WebCourse[] {
	const found = new Map<string, string>();
	// Link results win on name conflicts: cards carry the display name while
	// embedded pairs can be stale. Both signals union so a partial link parse
	// never drops courses the pairs saw.
	const add = (id: string | null, rawName: string, overwrite: boolean) => {
		if (!id) return;
		const clean = cleanName(rawName);
		if (looksLikeNoise(clean)) return;
		if (!overwrite && found.has(id)) return;
		found.set(id, clean);
	};
	// Primary signal: course cards link to /c/<base64 id> with the course
	// name as link text. The id must base64-decode to digits, which already
	// rejects nav links (/settings, /calendar) without a denylist. Inner
	// markup is stripped so cards rendering <a><span>Name</span></a> match
	// as well as plain-text links; the pair scan below stays the fallback
	// for markup variations. Both base64 alphabets are accepted: Classroom
	// has been seen emitting standard (+/) as well as URL-safe (-_) ids.
	const link = /\/c\/([A-Za-z0-9\-_+/]+={0,2})"[^>]*>([\s\S]{1,2000}?)<\/a>/g;
	let m: RegExpExecArray | null;
	while ((m = link.exec(html))) {
		// Cards may pack description/meta text after the name inside the
		// same anchor; over-long inners are likely polluted, so skip them
		// and let the id/name pair scan name the course instead.
		const name = cleanName(stripTags(m[2]));
		if (name.length > 160) continue;
		add(decodeCourseId(m[1]), name, true);
	}
	// Secondary signal: embedded id/name pairs. Always unioned with the link
	// results so a partial link parse never drops courses the pairs saw.
	// Whitespace-tolerant: payloads vary between compact and spaced JSON.
	const pair = /\[\s*"(\d{9,15})"\s*,\s*"([^"]{2,160})"/g;
	while ((m = pair.exec(html))) {
		add(m[1], m[2], false);
	}
	return [...found].map(([id, name]) => ({ id, name }));
}

function cleanName(raw: string): string {
	// Decode first: the canonical decoder emits nbsp as U+00A0, which \s
	// matches, so the normalize pass collapses it to a regular space.
	return decodeEntities(raw).replace(/\s+/g, ' ').trim();
}

// Link inner HTML may wrap the name in spans/divs; strip tags before the
// length/noise checks so nested card markup resolves to the same name.
function stripTags(inner: string): string {
	return inner.replace(/<[^>]*>/g, ' ');
}

function decodeCourseId(b64: string): string | null {
	for (const norm of [b64, b64.replace(/-/g, '+').replace(/_/g, '/')]) {
		try {
			const padded = norm + '='.repeat((4 - (norm.length % 4)) % 4);
			const text = Buffer.from(padded, 'base64').toString('utf8');
			if (COURSE_ID_RE.test(text)) return text;
		} catch {
			/* try next variant */
		}
	}
	return null;
}

// Structural noise only: URLs and email-shaped strings can never be course
// names. Non-course links are already rejected by the digit-id check above,
// so there is intentionally no keyword denylist here — do not add one. If
// cards change shape, extend the link pattern (with a fixture case) instead.
const looksLikeNoise = (name: string) =>
	name.length < 2 || /^https?:\/\//.test(name) || /\S+@\S+\.\S+/.test(name);

export type HomeDiag = {
	bytes: number;
	courseLinks: number;
	idPairs: number;
	initData: number;
};

/**
 * PII-free shape summary of a home page: raw signal counts only, never
 * names, ids, or emails. Surfaced in zero-course errors so a report tells
 * apart "empty shell page" (all zeros) from "cards present but unparsed"
 * (nonzero signals, zero courses) without anyone pasting page HTML.
 */
export function describeHomeHtml(html: string): HomeDiag {
	const count = (re: RegExp) => html.match(re)?.length ?? 0;
	return {
		bytes: html.length,
		courseLinks: count(/\/c\/[A-Za-z0-9\-_+/]+={0,2}"/g),
		idPairs: count(/\[\s*"\d{9,15}"\s*,\s*"/g),
		initData: count(/AF_initDataCallback/g)
	};
}
