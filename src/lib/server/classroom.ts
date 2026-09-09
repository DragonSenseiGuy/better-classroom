import { config } from './config';

export type RawAttachment = {
	type: string;
	title?: string;
	url?: string;
	thumbnailUrl?: string;
	shareMode?: string;
};

export type RawTeacher = { userId: string; name?: string; email?: string; photoUrl?: string };

export type RawCourse = {
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
	teachers: RawTeacher[];
};

export type RawOverview = {
	profile: { id: string; name?: string; email?: string; photoUrl?: string };
	courses: RawCourse[];
};

export type RawCourseWork = {
	id: string;
	title: string;
	description?: string;
	materials: RawAttachment[];
	state: string;
	alternateLink?: string;
	creationTime?: string;
	updateTime?: string;
	dueDate?: { year?: number; month?: number; day?: number };
	dueTime?: { hours?: number; minutes?: number };
	maxPoints?: number;
	workType?: string;
	topicId?: string;
	creatorUserId?: string;
};

export type RawMaterial = {
	id: string;
	title: string;
	description?: string;
	materials: RawAttachment[];
	alternateLink?: string;
	creationTime?: string;
	updateTime?: string;
	topicId?: string;
	creatorUserId?: string;
};

export type RawAnnouncement = {
	id: string;
	text?: string;
	materials: RawAttachment[];
	alternateLink?: string;
	creationTime?: string;
	updateTime?: string;
	creatorUserId?: string;
};

export type RawSubmission = {
	id: string;
	courseWorkId: string;
	state: string;
	late: boolean;
	draftGrade?: number;
	assignedGrade?: number;
	alternateLink?: string;
	courseWorkType?: string;
	creationTime?: string;
	updateTime?: string;
	attachments: RawAttachment[];
};

export type RawCourseContent = {
	partial?: boolean;
	courseWork: RawCourseWork[];
	materials: RawMaterial[];
	announcements: RawAnnouncement[];
	topics: { id: string; name: string; updateTime?: string }[];
	submissions: RawSubmission[];
};

const ATTEMPTS = 3;

export async function fetchAppsScript<T>(params: Record<string, string>): Promise<T> {
	const base = config.appsScriptUrl;
	const key = config.appsScriptKey;
	if (!base || !key) throw new Error('APPS_SCRIPT_URL and APPS_SCRIPT_KEY must be set in .env');
	const url = new URL(base);
	url.searchParams.set('key', key);
	for (const [k, val] of Object.entries(params)) url.searchParams.set(k, val);
	let lastError: Error = new Error('Apps Script request failed');
	for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
		try {
			return await fetchOnce<T>(url);
		} catch (err) {
			lastError = err instanceof Error ? err : new Error(String(err));
			if (
				!lastError.message.startsWith('Apps Script returned non-JSON') &&
				!lastError.message.includes('timed out')
			)
				throw lastError;
			if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, 2000 * attempt));
		}
	}
	throw lastError;
}

async function fetchOnce<T>(url: URL): Promise<T> {
	const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(180_000) });
	const text = await res.text();
	let body: unknown;
	try {
		body = JSON.parse(text);
	} catch {
		throw new Error(`Apps Script returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
	}
	if (body && typeof body === 'object' && 'error' in body) {
		throw new Error(`Apps Script error: ${(body as { error: string }).error}`);
	}
	return body as T;
}
