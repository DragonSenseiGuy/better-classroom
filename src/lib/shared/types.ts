export type Attachment = {
	type: string;
	title?: string;
	url?: string;
	thumbnailUrl?: string;
	shareMode?: string;
};

export type Teacher = { userId: string; name?: string; email?: string; photoUrl?: string };

export type Author = { name?: string; email?: string; photoUrl?: string };

export type Course = {
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
	createdAt: number;
	updatedAt: number;
	teachers: Teacher[];
	people?: Teacher[];
	students?: Author[];
	studentCount?: number;
	archived: boolean;
	lastSyncedAt?: number;
	nickname?: string;
	color?: string;
	hidden: boolean;
};

export type CourseWork = {
	id: string;
	courseId: string;
	title: string;
	description?: string;
	materials: Attachment[];
	alternateLink?: string;
	createdAt: number;
	updatedAt: number;
	dueAt?: number;
	hasDueTime: boolean;
	maxPoints?: number;
	workType: string;
	topicId?: string;
	creatorUserId?: string;
	html?: string;
	author?: Author;
};

export type Material = {
	id: string;
	courseId: string;
	title: string;
	description?: string;
	materials: Attachment[];
	alternateLink?: string;
	createdAt: number;
	updatedAt: number;
	topicId?: string;
	creatorUserId?: string;
	html?: string;
	author?: Author;
};

export type Announcement = {
	id: string;
	courseId: string;
	text: string;
	materials: Attachment[];
	alternateLink?: string;
	createdAt: number;
	updatedAt: number;
	creatorUserId?: string;
	html?: string;
	author?: Author;
};

export type RichStatus = {
	ok: boolean;
	message?: string;
	at: number;
	updated?: number;
	expired?: boolean;
	sessionSavedAt?: number;
};

export type KeepAlive = { rotatedAt?: number; refreshedAt?: number; nextRotateAt?: number };

export type Comment = {
	id: string;
	authorId: string;
	author?: Author;
	mine: boolean;
	text: string;
	html?: string;
	createdAt?: number;
};

export type ProviderId = 'google' | 'apps-script' | 'web';
export type ProviderRole = 'records' | 'enrichment';
export type ProviderState = 'off' | 'ready' | 'expired' | 'error';
export type ProviderStatus = {
	id: ProviderId;
	label: string;
	role: ProviderRole;
	state: ProviderState;
	active: boolean;
	detail?: string;
};

export type Topic = { id: string; courseId: string; name: string; updatedAt: number };

export type Submission = {
	id: string;
	courseId: string;
	courseWorkId: string;
	state: string;
	late: boolean;
	draftGrade?: number;
	assignedGrade?: number;
	alternateLink?: string;
	courseWorkType?: string;
	createdAt?: number;
	updatedAt: number;
	attachments: Attachment[];
};

export type Dismissal = { id: string; at: number };

export type Profile = { id: string; name?: string; email?: string; photoUrl?: string };

export type SyncStatus = {
	status: 'idle' | 'running' | 'error';
	configured: boolean;
	startedAt?: number;
	finishedAt?: number;
	error?: string;
	pending: number;
	courseCount: number;
	intervalMinutes: number;
	version: number;
};

export type CollectionName =
	| 'courses'
	| 'courseWork'
	| 'materials'
	| 'announcements'
	| 'topics'
	| 'submissions'
	| 'dismissals';

export type RowOf = {
	courses: Course;
	courseWork: CourseWork;
	materials: Material;
	announcements: Announcement;
	topics: Topic;
	submissions: Submission;
	dismissals: Dismissal;
};

export type Change<T = unknown> = { type: 'insert' | 'update' | 'delete'; key: string; value: T };

export type Snapshot = { [K in CollectionName]: RowOf[K][] } & {
	profile: Profile | null;
	sync: SyncStatus;
};

export type ServerEvent =
	| { type: 'hello'; version: number; sync: SyncStatus }
	| { type: 'changes'; version: number; collection: CollectionName; changes: Change[] }
	| { type: 'sync'; sync: SyncStatus };

export type SearchDoc = {
	kind: 'course' | 'work' | 'material' | 'announcement';
	id: string;
	courseId: string;
	courseName: string;
	title: string;
	snippet: string;
	href: string;
	dueAt?: number;
	updatedAt: number;
};
