// Cookie-backed record source: lets the app sync without an Apps Script
// deployment, for school accounts where script.google.com is disabled.
//
// Coverage (v1):
// - courses: the gXtzob list query the web app boots with (id, name,
//   section, room, owner, calendar, timestamps, active/archived). The home
//   HTML scrape stays only as a fallback: the page is a JS shell with no
//   course data, so it yields section/room-empty rows when used.
// - posts: the stream RPC already used for enrichment. Titles and timestamps
//   are best-effort; due dates, max points and topics are not mapped yet.
// - people: members + profiles RPCs, same as enrichment.
// - submissions/grades: NOT available. The web QuerySubmission RPC rejects
//   replays from this session, so the grades tab stays empty in session mode.
//   Turn-in / reclaim still works through the web session (enrich path).
//
// Registration order in hooks keeps Apps Script primary: this provider only
// serves when no script connection is saved.

import {
	SessionError,
	encodeCourseId,
	writeSubmissionState,
	type StreamItem
} from './classroom-web';
import { parseCoursesHtml, describeHomeHtml, type WebCourse } from './course-discovery';
import {
	ensureProfiles,
	fetchCoursePeople,
	fetchManyCoursePeople,
	findProfileByEmail,
	iterateCourseStream,
	requireSession,
	sessionCourseList,
	sessionTokensWithHtml,
	toRawTeacher,
	withWebStudent
} from './web-session';
import { getCourse, getWebSession } from './store';
import type {
	Provider,
	RawAnnouncement,
	RawCourse,
	RawCourseContent,
	RawCourseWork,
	RawLookup,
	RawOverview,
	RawSubmissionAction,
	RawTeacher
} from './providers';

const courseUrl = (courseId: string) =>
	`https://classroom.google.com/c/${encodeCourseId(courseId)}`;

const TITLE_FALLBACK_LENGTH = 120;

async function overview(since: number): Promise<RawOverview> {
	const session = requireSession();
	const { tokens, html } = await sessionTokensWithHtml(session);
	// Primary signal: the list RPC the web app boots with. The home HTML is
	// a JS shell with no course data, so it stays only as a fallback for
	// list-RPC failures (its shapes are a subset of the RPC fields).
	const listed = await sessionCourseList(session).catch(() => []);
	type Discovered = WebCourse & Partial<RawCourse> & { courseState?: string };
	const discovered: Discovered[] = listed.length ? listed : parseCoursesHtml(html);
	if (discovered.length === 0) {
		const d = describeHomeHtml(html);
		throw new SessionError(
			`Signed in${tokens.email ? ` as ${tokens.email}` : ''} on slot /u/${session.authuser}/, ` +
				`but no courses were found (list RPC empty; ${Math.round(d.bytes / 1024)}KB, links:${d.courseLinks} ` +
				`pairs:${d.idPairs} init:${d.initData}). ` +
				`If that slot is a personal account, reconnect with a cookie from your school account. ` +
				`If courses are visible there, Google may have changed the page markup — please report this line.`
		);
	}
	// Like the Apps Script source, incremental syncs skip member resolution:
	// rosters rarely change, and the store preserves previous teachers.
	// Newly discovered courses always resolve teachers — there is nothing
	// preserved for them yet. Fan-out lives in fetchManyCoursePeople so the
	// enrichment path and this record source share one pipeline.
	const full = !since;
	const needRoster = discovered.filter((d) => full || !getCourse(d.id));
	const { teachersByCourse, errors } = await fetchManyCoursePeople(
		session,
		needRoster.map((d) => d.id)
	);
	// fetchManyCoursePeople already ensured every roster profile through the
	// single writer; resolve the overview identity from the same store read.
	const profiles = await ensureProfiles(session, []);
	const courses: RawCourse[] = discovered.map((d: Discovered) => ({
		id: d.id,
		name: d.name,
		section: d.section,
		descriptionHeading: d.descriptionHeading,
		room: d.room,
		ownerId: d.ownerId,
		courseState: d.courseState ?? 'ACTIVE',
		alternateLink: courseUrl(d.id),
		calendarId: d.calendarId,
		creationTime: d.creationTime,
		updateTime: d.updateTime,
		teachers: teachersByCourse.get(d.id)
	}));
	const me = tokens.email?.toLowerCase();
	const mine = findProfileByEmail(profiles, me);
	// Stable id across runs: web:<email> until a synced profile matches,
	// so the first sync does not churn the profile row on the second.
	const profileId = mine?.id ?? (me ? `web:${me}` : 'me');
	return {
		profile: {
			id: profileId,
			name: mine?.author.name,
			email: tokens.email,
			photoUrl: mine?.author.photoUrl
		},
		courses,
		errors
	};
}

function postBase(courseId: string, item: StreamItem, path: string) {
	// The stream exposes creation time only; creationTime is the honest
	// field. The course page orders the stream by updatedAt, so mirror
	// creation into updateTime — otherwise every web post lands at
	// updatedAt 0 and the ordering collapses to insertion order (stale
	// posts on top). Edits to existing posts still surface on full syncs,
	// not incremental filters.
	const creationTime = item.createdAt ? new Date(item.createdAt).toISOString() : undefined;
	return {
		id: item.id,
		materials: [],
		alternateLink: `${courseUrl(courseId)}/${path}`,
		creationTime,
		updateTime: creationTime,
		creatorUserId: item.creatorId
	};
}

const postTitle = (item: StreamItem) =>
	item.title || item.text.slice(0, TITLE_FALLBACK_LENGTH) || 'Untitled';

async function courseContent(
	courseId: string,
	since: number,
	_wantSubmissions: boolean
): Promise<RawCourseContent> {
	const session = requireSession();
	const announcements: RawAnnouncement[] = [];
	const courseWork: RawCourseWork[] = [];
	// No early break on `since`: stream ordering isn't established as
	// creation-descending, so stopping at the first stale item could drop
	// content. Filter on creation time instead; edits to existing posts
	// arrive on full syncs (and text/author edits via enrichment).
	for await (const page of iterateCourseStream(session, courseId)) {
		for (const item of page.items) {
			if (since && item.createdAt && item.createdAt < since) continue;
			if (item.kind === 'courseWork')
				courseWork.push({
					...postBase(courseId, item, `a/${item.id}/details`),
					title: postTitle(item),
					description: item.text,
					state: 'PUBLISHED',
					workType: 'ASSIGNMENT'
				});
			// Announcements are the default bucket: the classifier only
			// returns courseWork on a positive title signal. Materials share
			// the coursework shape until mapped, so they surface as
			// courseWork above.
			else announcements.push({ ...postBase(courseId, item, `p/${item.id}`), text: item.text });
		}
	}
	// materials stays an explicit empty list (not omitted) so a full sync
	// clears rows left by a previous source; submissions below does the same
	// for grades, which the session cannot see.
	return { partial: since > 0, announcements, courseWork, materials: [], submissions: [] };
}

async function lookup(courseId: string, users: string[]): Promise<RawLookup> {
	const session = requireSession();
	try {
		// fetchCoursePeople already ensured every roster profile through the
		// single writer; one more ensure covers only non-roster user ids
		// (and returns the full map without a write when there are none).
		const people = await fetchCoursePeople(session, courseId);
		const roster = new Set([...people.teachers, ...people.students].map((t) => t.userId));
		const extraIds = users.filter((id) => id && !roster.has(id));
		const profiles = await ensureProfiles(session, extraIds);
		const extraPeople: RawTeacher[] = extraIds.map((id) => toRawTeacher(id, profiles[id]));
		return { teachers: people.teachers, people: extraPeople };
	} catch (err) {
		return { errors: { teachers: err instanceof Error ? err.message : String(err) } };
	}
}

async function submissionAction(
	action: 'turnIn' | 'reclaim',
	courseId: string,
	workId: string,
	submissionId: string
): Promise<RawSubmissionAction> {
	const { session, studentId, jar, tokens } = await withWebStudent();
	const result = await writeSubmissionState(
		action,
		jar,
		session.authuser,
		tokens,
		studentId,
		workId,
		courseId
	);
	const now = new Date().toISOString();
	return {
		submission: {
			id: submissionId,
			courseWorkId: workId,
			state: result.turnedIn ? 'TURNED_IN' : 'RECLAIMED_BY_STUDENT',
			late: false,
			creationTime: now,
			updateTime: now,
			attachments: []
		}
	};
}

export const webRecordsProvider: Provider = {
	status: () => {
		const session = getWebSession();
		return {
			id: 'web-records',
			label: 'Session sync',
			role: 'records',
			state: session ? 'ready' : 'off',
			active: false,
			detail: session ? 'Cookie saved. Grades unavailable in session mode.' : 'No cookie saved.'
		};
	},
	records: { overview, courseContent, lookup, submissionAction }
};
