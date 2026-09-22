import type { Comment, Course, SubmissionFile } from '#lib/shared/types.ts';

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

const unwrap = (text: string) => text.replace(/^.*"message":"([^"]*)".*$/s, '$1');

async function send<T>(path: string, init: RequestInit = {}): Promise<T> {
	const res = await fetch(path, init);
	if (!res.ok) throw new Error(unwrap(await res.text()));
	const text = await res.text();
	return (text ? JSON.parse(text) : undefined) as T;
}

const withBody = (method: string, body: unknown): RequestInit =>
	body instanceof FormData
		? { method, body }
		: { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };

export const api = {
	get: <T>(path: string, params?: Record<string, string>) =>
		send<T>(params ? `${path}?${new URLSearchParams(params)}` : path),
	post: <T = void>(path: string, body?: unknown) => send<T>(path, withBody('POST', body)),
	del: <T = void>(path: string, body?: unknown) => send<T>(path, withBody('DELETE', body))
};

export const avatarUrl = (url: string | undefined) =>
	url ? `/api/avatar?u=${encodeURIComponent(url)}` : undefined;

export type SubmissionAction = 'turnIn' | 'reclaim';
export type CoursePrefs = { nickname?: string | null; color?: string | null; hidden?: boolean };
export type WorkRef = { courseId: string; workId: string };

export const setDismissed = (ids: string[], dismissed: boolean) =>
	api.post('/api/dismiss', { ids, dismissed });

export const setCoursePrefs = (id: string, patch: CoursePrefs) =>
	api.post(`/api/courses/${id}/prefs`, patch);

export const syncSingleCourse = (id: string) =>
	api.post<{ course: Course }>(`/api/courses/${id}/sync`, {});

export const submitWork = (action: SubmissionAction, ref: WorkRef & { submissionId?: string }) =>
	api.post('/api/submissions', { action, ...ref });

export const comments = {
	list: (ref: WorkRef) =>
		api.get<{ comments: Comment[] }>('/api/comments', ref).then((r) => r.comments),
	post: (ref: WorkRef, text: string) => api.post('/api/comments', { ...ref, text }),
	remove: (ref: WorkRef, commentId: string) => api.del('/api/comments', { ...ref, commentId })
};

const files = (r: { files: SubmissionFile[] }) => r.files;

export const submissionFiles = {
	list: (ref: WorkRef) => api.get<{ files: SubmissionFile[] }>('/api/attachments', ref).then(files),
	upload: (ref: WorkRef, file: File) => {
		const body = new FormData();
		body.append('file', file);
		return api
			.post<{ files: SubmissionFile[] }>(`/api/attachments?${new URLSearchParams(ref)}`, body)
			.then(files);
	},
	remove: (ref: WorkRef, driveId: string) =>
		api.del<{ files: SubmissionFile[] }>('/api/attachments', { ...ref, driveId }).then(files)
};
