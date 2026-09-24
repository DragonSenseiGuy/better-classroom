import type {
	Change,
	CollectionName,
	Comment,
	ProviderStatus,
	RichStatus,
	SubmissionFile
} from '#lib/shared/types.ts';

export type Publish = (collection: CollectionName, changes: Change[]) => void;

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
	teachers?: RawTeacher[];
};

export type RawOverview = {
	profile: { id: string; name?: string; email?: string; photoUrl?: string };
	courses: RawCourse[];
	errors?: Record<string, string>;
};

export type RawLookup = {
	teachers?: RawTeacher[];
	topics?: { id: string; name: string; updateTime?: string }[];
	people?: RawTeacher[];
	errors?: Record<string, string>;
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

export type RawSubmissionAction = { submission: RawSubmission };

export type RawCourseContent = {
	partial?: boolean;
	courseWork?: RawCourseWork[];
	materials?: RawMaterial[];
	announcements?: RawAnnouncement[];
	topics?: { id: string; name: string; updateTime?: string }[];
	submissions?: RawSubmission[];
	errors?: Record<string, string>;
};

/**
 * The record methods the sync needs from whichever provider owns courses,
 * posts and submissions, expressed in the Classroom REST API's shapes.
 */
export type RecordSource = {
	overview(since: number): Promise<RawOverview>;
	courseContent(
		courseId: string,
		since: number,
		wantSubmissions: boolean
	): Promise<RawCourseContent>;
	lookup(courseId: string, users: string[]): Promise<RawLookup>;
	submissionAction(
		action: 'turnIn' | 'reclaim',
		courseId: string,
		workId: string,
		submissionId: string
	): Promise<RawSubmissionAction>;
};

/**
 * Adds what the record source cannot see, layered onto rows it created:
 * formatted HTML, web-side authors, classmates. Runs after every sync.
 */
export type Enricher = {
	enrich(options: { full?: boolean }, publish: Publish): Promise<RichStatus | null>;
	keepAlive(): Promise<unknown>;
	/**
	 * Hand-in through the web session. The REST API refuses turnIn on work
	 * created by any other OAuth project, so this is the only path that works
	 * for teacher-created assignments.
	 */
	submissionAction?(
		action: 'turnIn' | 'reclaim',
		courseId: string,
		workId: string
	): Promise<{ turnedIn: boolean }>;
	comments?: {
		list(courseId: string, workId: string): Promise<Comment[]>;
		post(courseId: string, workId: string, text: string): Promise<Comment | null>;
		remove(courseId: string, workId: string, commentId: string): Promise<void>;
	};
	attachments?: {
		list(courseId: string, workId: string): Promise<SubmissionFile[]>;
		upload(
			courseId: string,
			workId: string,
			file: { name: string; type: string; bytes: Uint8Array }
		): Promise<SubmissionFile[]>;
		remove(courseId: string, workId: string, driveId: string): Promise<SubmissionFile[]>;
	};
};

export type Provider = {
	status(): ProviderStatus;
	records?: RecordSource;
	enrich?: Enricher;
};

const registry: Provider[] = [];

/**
 * Registration order is priority: the first usable record source wins.
 * Replaces any earlier set, since the server init hook re-runs under hot
 * reload and duplicates would surface as repeated rows in Settings.
 */
export function registerProviders(...providers: Provider[]) {
	registry.splice(0, registry.length, ...providers);
}

const usable = (p: Provider) => p.status().state !== 'off';

export const recordProvider = () => registry.find((p) => p.records && usable(p)) ?? null;

export const hasRecordSource = () => recordProvider() !== null;

export function recordSource(): RecordSource {
	const provider = recordProvider();
	if (!provider?.records)
		throw new Error('No Classroom source is connected. Finish setup at /setup.');
	return provider.records;
}

export const enrichers = () =>
	registry.filter((p): p is Provider & { enrich: Enricher } => Boolean(p.enrich) && usable(p));

export function providerStatuses(): ProviderStatus[] {
	const primary = recordProvider();
	return registry.map((p) => {
		const status = p.status();
		return {
			...status,
			active: status.role === 'records' ? p === primary : status.state !== 'off'
		};
	});
}
