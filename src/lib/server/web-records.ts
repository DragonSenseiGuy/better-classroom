// Cookie-backed record source: lets the app sync without an Apps Script
// deployment, for school accounts where script.google.com is disabled.
//
// Coverage (v1):
// - courses: scraped from the Classroom home page HTML. Section/room are
//   empty until a HAR capture maps the embedded init-data fields.
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
import { parseCoursesHtml, type WebCourse } from './course-discovery';
import {
	ensureProfiles,
	fetchCoursePeople,
	fetchManyCoursePeople,
	findProfileByEmail,
	iterateCourseStream,
	requireSession,
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
	const discovered = parseCoursesHtml(html);
	if (discovered.length === 0)
		throw new SessionError(
			'Signed in, but no courses were found on the Classroom home page. ' +
				'If you have courses, Google may have changed the page markup — please report it.'
		);
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
	const courses: RawCourse[] = discovered.map((d: WebCourse) => ({
		id: d.id,
		name: d.name,
		courseState: 'ACTIVE',
		alternateLink: courseUrl(d.id),
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
	// field. Edits to existing posts surface on full syncs, not incremental
	// filters.
	return {
		id: item.id,
		materials: [],
		alternateLink: `${courseUrl(courseId)}/${path}`,
		creationTime: item.createdAt ? new Date(item.createdAt).toISOString() : undefined,
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
