import { config } from './config';
import { getMeta, setMeta } from './store';
import type {
	RawAttachment,
	RawCourseContent,
	RawLookup,
	RawOverview,
	RawSubmissionAction,
	RawTeacher,
	Ping
} from './classroom';

export const SCOPES = [
	'https://www.googleapis.com/auth/classroom.courses.readonly',
	'https://www.googleapis.com/auth/classroom.announcements.readonly',
	'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
	'https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly',
	'https://www.googleapis.com/auth/classroom.topics.readonly',
	'https://www.googleapis.com/auth/classroom.rosters.readonly',
	'https://www.googleapis.com/auth/classroom.profile.emails'
];

export type GoogleTokens = {
	accessToken: string;
	refreshToken: string;
	expiresAt: number;
	scope: string;
};

const TOKENS_KEY = 'googleTokens';
const API = 'https://classroom.googleapis.com/v1';

export const hasGoogleClient = () => Boolean(config.googleClientId && config.googleClientSecret);
export const getGoogleTokens = () => getMeta<GoogleTokens>(TOKENS_KEY) ?? null;
export const isGoogleConnected = () =>
	hasGoogleClient() && Boolean(getGoogleTokens()?.refreshToken);
export function clearGoogleTokens() {
	setMeta(TOKENS_KEY, null);
}

export function authUrl(origin: string, state: string) {
	const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
	url.searchParams.set('client_id', config.googleClientId ?? '');
	url.searchParams.set('redirect_uri', `${origin}/auth/callback`);
	url.searchParams.set('response_type', 'code');
	url.searchParams.set('scope', SCOPES.join(' '));
	url.searchParams.set('access_type', 'offline');
	url.searchParams.set('prompt', 'consent');
	url.searchParams.set('include_granted_scopes', 'true');
	url.searchParams.set('state', state);
	return url.toString();
}

type TokenResponse = {
	access_token: string;
	refresh_token?: string;
	expires_in: number;
	scope: string;
	error?: string;
	error_description?: string;
};

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
	const res = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: config.googleClientId ?? '',
			client_secret: config.googleClientSecret ?? '',
			...params
		})
	});
	const body = (await res.json()) as TokenResponse;
	if (!res.ok || body.error)
		throw new Error(`Google token error: ${body.error_description ?? body.error ?? res.status}`);
	return body;
}

export async function exchangeCode(origin: string, code: string) {
	const body = await tokenRequest({
		code,
		grant_type: 'authorization_code',
		redirect_uri: `${origin}/auth/callback`
	});
	if (!body.refresh_token) throw new Error('Google did not return a refresh token. Try again.');
	const tokens: GoogleTokens = {
		accessToken: body.access_token,
		refreshToken: body.refresh_token,
		expiresAt: Date.now() + (body.expires_in - 60) * 1000,
		scope: body.scope
	};
	setMeta(TOKENS_KEY, tokens);
	return tokens;
}

async function accessToken(): Promise<string> {
	const tokens = getGoogleTokens();
	if (!tokens) throw new Error('Not signed in to Google.');
	if (Date.now() < tokens.expiresAt) return tokens.accessToken;
	const body = await tokenRequest({
		refresh_token: tokens.refreshToken,
		grant_type: 'refresh_token'
	});
	const next: GoogleTokens = {
		...tokens,
		accessToken: body.access_token,
		expiresAt: Date.now() + (body.expires_in - 60) * 1000
	};
	setMeta(TOKENS_KEY, next);
	return next.accessToken;
}

const TRANSIENT = /quota|rate ?limit|429|5\d\d|internal|backend|unavailable|timeout/i;

async function api<T>(
	path: string,
	query: Record<string, string | undefined> = {},
	init: { method?: string; body?: unknown } = {}
): Promise<T> {
	const url = new URL(`${API}/${path}`);
	for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, v);
	let delay = 1000;
	for (let attempt = 0; ; attempt++) {
		const res = await fetch(url, {
			method: init.method ?? 'GET',
			headers: {
				authorization: `Bearer ${await accessToken()}`,
				...(init.body !== undefined ? { 'content-type': 'application/json' } : {})
			},
			body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
			signal: AbortSignal.timeout(60_000)
		});
		if (res.ok) return (await res.json()) as T;
		const text = await res.text();
		let message = `${res.status}`;
		try {
			message = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? message;
		} catch {}
		const transient = res.status === 429 || res.status >= 500 || TRANSIENT.test(message);
		if (attempt >= 2 || !transient) throw new Error(`Classroom API ${res.status}: ${message}`);
		await new Promise((r) => setTimeout(r, delay));
		delay *= 2;
	}
}

async function paginate<T>(
	path: string,
	key: string,
	query: Record<string, string | undefined>,
	since = 0
): Promise<T[]> {
	const out: T[] = [];
	let pageToken: string | undefined;
	do {
		const page = await api<Record<string, unknown> & { nextPageToken?: string }>(path, {
			...query,
			pageSize: '100',
			pageToken
		});
		const items = (page[key] as (T & { updateTime?: string })[] | undefined) ?? [];
		for (const item of items) {
			if (since && item.updateTime && Date.parse(item.updateTime) < since) return out;
			out.push(item);
		}
		pageToken = page.nextPageToken;
	} while (pageToken);
	return out;
}

async function attempt<T>(
	errors: Record<string, string>,
	key: string,
	compute: () => Promise<T>
): Promise<T | undefined> {
	try {
		return await compute();
	} catch (err) {
		errors[key] = err instanceof Error ? err.message : String(err);
		return undefined;
	}
}

const absolute = (url?: string) => (url?.startsWith('//') ? `https:${url}` : url);

type GProfile = {
	id: string;
	name?: { fullName?: string };
	emailAddress?: string;
	photoUrl?: string;
};

const slimProfile = (p: GProfile) => ({
	id: p.id,
	name: p.name?.fullName,
	email: p.emailAddress,
	photoUrl: absolute(p.photoUrl)
});

export async function profile() {
	return slimProfile(await api<GProfile>('userProfiles/me'));
}

export async function ping(): Promise<Ping> {
	const me = await profile();
	const page = await api<{ courses?: unknown[] }>('courses', {
		studentId: 'me',
		courseStates: 'ACTIVE',
		pageSize: '100'
	});
	return { ok: true, profile: me, courseCount: page.courses?.length ?? 0 };
}

async function listTeachers(courseId: string): Promise<RawTeacher[]> {
	const rows = await paginate<{ userId: string; profile?: GProfile }>(
		`courses/${courseId}/teachers`,
		'teachers',
		{}
	);
	return rows.map((t) => ({
		userId: t.userId,
		name: t.profile?.name?.fullName,
		email: t.profile?.emailAddress,
		photoUrl: absolute(t.profile?.photoUrl)
	}));
}

async function listTopics(courseId: string) {
	const rows = await paginate<{ topicId: string; name: string; updateTime?: string }>(
		`courses/${courseId}/topics`,
		'topic',
		{}
	);
	return rows.map((t) => ({ id: t.topicId, name: t.name, updateTime: t.updateTime }));
}

type GCourse = {
	id: string;
	name: string;
	section?: string;
	descriptionHeading?: string;
	description?: string;
	room?: string;
	ownerId?: string;
	courseState: string;
	alternateLink?: string;
	calendarId?: string;
	creationTime?: string;
	updateTime?: string;
};

export async function overview(since: number): Promise<RawOverview> {
	const me = await profile();
	const courses = await paginate<GCourse>('courses', 'courses', {
		studentId: 'me',
		courseStates: 'ACTIVE'
	});
	const errors: Record<string, string> = {};
	const out: RawOverview['courses'] = [];
	for (const c of courses) {
		const course: RawOverview['courses'][number] = {
			id: c.id,
			name: c.name,
			section: c.section,
			descriptionHeading: c.descriptionHeading,
			description: c.description,
			room: c.room,
			ownerId: c.ownerId,
			courseState: c.courseState,
			alternateLink: c.alternateLink,
			calendarId: c.calendarId,
			creationTime: c.creationTime,
			updateTime: c.updateTime
		};
		if (!since) {
			const teachers = await attempt(errors, `teachers:${c.id}`, () => listTeachers(c.id));
			if (teachers) course.teachers = teachers;
		}
		out.push(course);
	}
	return { profile: me, courses: out, errors };
}

type GMaterial = {
	driveFile?: {
		driveFile?: { title?: string; alternateLink?: string; thumbnailUrl?: string };
		shareMode?: string;
	};
	youtubeVideo?: { title?: string; alternateLink?: string; thumbnailUrl?: string };
	link?: { title?: string; url?: string; thumbnailUrl?: string };
	form?: { title?: string; formUrl?: string; thumbnailUrl?: string };
};

function slimAttachment(m: GMaterial): RawAttachment {
	if (m.driveFile) {
		const f = m.driveFile.driveFile ?? {};
		return {
			type: 'drive',
			title: f.title,
			url: f.alternateLink,
			thumbnailUrl: f.thumbnailUrl,
			shareMode: m.driveFile.shareMode
		};
	}
	if (m.youtubeVideo)
		return {
			type: 'youtube',
			title: m.youtubeVideo.title,
			url: m.youtubeVideo.alternateLink,
			thumbnailUrl: m.youtubeVideo.thumbnailUrl
		};
	if (m.link)
		return {
			type: 'link',
			title: m.link.title,
			url: m.link.url,
			thumbnailUrl: m.link.thumbnailUrl
		};
	if (m.form)
		return {
			type: 'form',
			title: m.form.title,
			url: m.form.formUrl,
			thumbnailUrl: m.form.thumbnailUrl
		};
	return { type: 'unknown', title: '', url: '' };
}

type WithMaterials = { materials?: GMaterial[] };
type GSubmission = {
	id: string;
	courseWorkId: string;
	state: string;
	late?: boolean;
	draftGrade?: number;
	assignedGrade?: number;
	alternateLink?: string;
	courseWorkType?: string;
	creationTime?: string;
	updateTime?: string;
	assignmentSubmission?: { attachments?: GMaterial[] };
};

export async function courseContent(
	courseId: string,
	since: number,
	wantSubmissions: boolean
): Promise<RawCourseContent> {
	const partial = since > 0;
	const errors: Record<string, string> = {};
	const out: RawCourseContent = { partial, errors };
	const withMaterials = <T extends WithMaterials>(row: T) => ({
		...row,
		materials: (row.materials ?? []).map(slimAttachment)
	});

	const courseWork = await attempt(errors, 'courseWork', () =>
		paginate<WithMaterials>(
			`courses/${courseId}/courseWork`,
			'courseWork',
			{ courseWorkStates: 'PUBLISHED', orderBy: 'updateTime desc' },
			since
		)
	);
	if (courseWork)
		out.courseWork = courseWork.map(withMaterials) as unknown as RawCourseContent['courseWork'];

	const materials = await attempt(errors, 'materials', () =>
		paginate<WithMaterials>(
			`courses/${courseId}/courseWorkMaterials`,
			'courseWorkMaterial',
			{ courseWorkMaterialStates: 'PUBLISHED', orderBy: 'updateTime desc' },
			since
		)
	);
	if (materials)
		out.materials = materials.map(withMaterials) as unknown as RawCourseContent['materials'];

	const announcements = await attempt(errors, 'announcements', () =>
		paginate<WithMaterials>(
			`courses/${courseId}/announcements`,
			'announcements',
			{ announcementStates: 'PUBLISHED', orderBy: 'updateTime desc' },
			since
		)
	);
	if (announcements)
		out.announcements = announcements.map(
			withMaterials
		) as unknown as RawCourseContent['announcements'];

	if (!partial) {
		const topics = await attempt(errors, 'topics', () => listTopics(courseId));
		if (topics) out.topics = topics;
	}

	if (wantSubmissions || (courseWork && courseWork.length > 0)) {
		const submissions = await attempt(errors, 'submissions', () =>
			paginate<GSubmission>(
				`courses/${courseId}/courseWork/-/studentSubmissions`,
				'studentSubmissions',
				{
					userId: 'me'
				}
			)
		);
		if (submissions)
			out.submissions = submissions.map((s) => ({
				id: s.id,
				courseWorkId: s.courseWorkId,
				state: s.state,
				late: !!s.late,
				draftGrade: s.draftGrade,
				assignedGrade: s.assignedGrade,
				alternateLink: s.alternateLink,
				courseWorkType: s.courseWorkType,
				creationTime: s.creationTime,
				updateTime: s.updateTime,
				attachments: (s.assignmentSubmission?.attachments ?? []).map(slimAttachment)
			})) as unknown as RawCourseContent['submissions'];
	}
	return out;
}

export async function lookup(courseId: string, users: string[]): Promise<RawLookup> {
	const errors: Record<string, string> = {};
	const out: RawLookup = { errors };
	const teachers = await attempt(errors, 'teachers', () => listTeachers(courseId));
	if (teachers) out.teachers = teachers;
	const topics = await attempt(errors, 'topics', () => listTopics(courseId));
	if (topics) out.topics = topics;
	const known = new Set((teachers ?? []).map((t) => t.userId));
	out.people = [];
	for (const id of users) {
		if (!id || known.has(id)) continue;
		const p = await attempt(errors, `user:${id}`, () => api<GProfile>(`userProfiles/${id}`));
		if (p) {
			const s = slimProfile(p);
			out.people.push({ userId: s.id, name: s.name, email: s.email, photoUrl: s.photoUrl });
		}
	}
	return out;
}

const WRITE_SCOPE = 'https://www.googleapis.com/auth/classroom.coursework.me';

const slimSubmission = (s: GSubmission) => ({
	id: s.id,
	courseWorkId: s.courseWorkId,
	state: s.state,
	late: !!s.late,
	draftGrade: s.draftGrade,
	assignedGrade: s.assignedGrade,
	alternateLink: s.alternateLink,
	courseWorkType: s.courseWorkType,
	creationTime: s.creationTime,
	updateTime: s.updateTime,
	attachments: (s.assignmentSubmission?.attachments ?? []).map(slimAttachment)
});

export async function submissionAction(
	action: 'turnIn' | 'reclaim',
	courseId: string,
	workId: string,
	submissionId: string
): Promise<RawSubmissionAction> {
	const granted = getGoogleTokens()?.scope.split(' ') ?? [];
	if (!granted.includes(WRITE_SCOPE))
		throw new Error(
			'Google sign-in is read-only. Marking work done needs the classroom.coursework.me scope, which your school has not allowlisted yet.'
		);
	const base = `courses/${courseId}/courseWork/${workId}/studentSubmissions/${submissionId}`;
	await api(`${base}:${action}`, {}, { method: 'POST', body: {} });
	return { submission: slimSubmission(await api<GSubmission>(base)) };
}

export async function fetchGoogle<T>(params: Record<string, string>): Promise<T> {
	const since = params.since ? Number(params.since) : 0;
	if (params.action === 'turnIn' || params.action === 'reclaim')
		return (await submissionAction(
			params.action,
			params.course,
			params.work,
			params.submission
		)) as T;
	if (params.course && params.lookup)
		return (await lookup(params.course, (params.users ?? '').split(',').filter(Boolean))) as T;
	if (params.course) return (await courseContent(params.course, since, params.work !== '0')) as T;
	return (await overview(since)) as T;
}
