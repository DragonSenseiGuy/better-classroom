// Reverse-engineered wire schema for Classroom's internal batchexecute RPCs.
//
// These endpoints speak protobuf-over-JSON: every message is a positional
// array where index N-1 holds field number N, gaps are null, and nested
// messages are nested arrays. Google ships no field names, so the names and
// numbers below are recovered from observed traffic (see probe captures) and
// from intuition about the domain, the way a modding community maps an
// undocumented binary format. Treat them as a best-effort map, not gospel:
// when Google reorders a field the decoder returns undefined for it rather
// than throwing, and a new capture updates the number here.

import { f, rep, message } from './proto';

// ---- shared -------------------------------------------------------------

/** `[id]` — a bare id in its own array. */
export const IdBox = message<{ id: string }>('IdBox', { 1: f('id', 'string') });

/** `[id, [courseId]]` — identifies a post within a course. */
export const PostKey = message<{ id: string; course: { id: string } }>('PostKey', {
	1: f('id', 'string'),
	2: f('course', IdBox, 'course id wrapped in its own array')
});

// ---- stream (rpc pONvgf, tag hrsi.qr) -----------------------------------

export const Paging = message<{ hasMore: boolean; token: string }>('Paging', {
	1: f('hasMore', 'bool'),
	2: f('token', 'string', 'continuation token, wrapped: [token]')
});

export const StreamEnvelope = message<{
	tag: string;
	paging: { hasMore: boolean; token: string };
	entries: unknown[];
}>(
	'StreamEnvelope',
	{
		1: f('tag', 'string', '"hrsi.qr"'),
		2: f('paging', Paging),
		3: rep('entries', 'json', 'each is [kind, ...] wrapping one PostItem')
	},
	'hrsi.qr'
);

/**
 * One post. Announcements arrive as entry `[3, null, [PostItem]]`, assignments
 * and materials as `[2, [PostItem]]`; the kind wrapper is stripped by findItem
 * before decoding. Rich text sits several levels deep in field 28 and stays a
 * hand-walked locator (findRichText) because its position varies by post type.
 */
export const PostItem = message<{
	key: { id: string; course: { id: string } };
	creator: { id: string };
}>('PostItem', {
	1: f('key', PostKey),
	5: f('creator', IdBox, 'author user id, web-side namespace (12 digits)')
});

// ---- profiles (rpc UG41I, tag hrq.usr) ----------------------------------

export const ProfileEntry = message<{
	key: { id: string };
	name: string;
	email: string;
	photoUrl: string;
}>('ProfileEntry', {
	1: f('key', IdBox),
	2: f('name', 'string'),
	3: f('email', 'string'),
	5: f('photoUrl', 'string', '//lh3… host-relative; needs https: prefix')
});

export const ProfilesEnvelope = message<{ tag: string; entries: unknown[] }>(
	'ProfilesEnvelope',
	{
		1: f('tag', 'string', '"hrq.usr"'),
		3: rep('entries', 'json', 'each is a ProfileEntry')
	},
	'hrq.usr'
);

// ---- course members (rpc gXtzob, tag hrq.crs) ---------------------------
//
// The member record is the exception to the positional rule: field 3 is a
// map keyed by *stringified field numbers*, so it decodes as a plain object
// rather than an array. Students live under key "8", teachers under "22",
// each an array of [userId] boxes. parseMembersPayload reads it directly.
export const MEMBERS = { students: '8', teachers: '22' } as const;
