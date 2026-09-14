import { workStatus, type WorkStatus } from '#lib/shared/status.ts';
import type { CourseWork, Submission } from '#lib/shared/types.ts';

export type WorkSummary = CourseWork & {
	courseName: string;
	status: WorkStatus;
	late: boolean;
	assignedGrade?: number;
	draftGrade?: number;
	submissionId?: string;
};

export function summarize(
	w: CourseWork,
	sub: Submission | undefined,
	courseName: string,
	now = Date.now()
): WorkSummary {
	return {
		...w,
		courseName,
		status: workStatus(sub, w.dueAt, now),
		late: sub?.late ?? false,
		assignedGrade: sub?.assignedGrade,
		draftGrade: sub?.draftGrade,
		submissionId: sub?.id
	};
}

export const canTurnIn = (w: WorkSummary) => isOpen(w) && w.submissionId !== undefined;
export const canReclaim = (w: WorkSummary) =>
	w.status === 'turnedIn' && w.submissionId !== undefined;

const NEW_WINDOW = 3 * 86_400_000;

export const isOpen = (w: { status: WorkStatus }) =>
	w.status === 'assigned' || w.status === 'missing';

export const isNew = (w: { createdAt: number; status: WorkStatus }, now = Date.now()) =>
	isOpen(w) && now - w.createdAt < NEW_WINDOW;

export const byDue = (
	a: { dueAt?: number; updatedAt: number },
	b: { dueAt?: number; updatedAt: number }
) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) || b.updatedAt - a.updatedAt;
