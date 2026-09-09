import { workStatus, type WorkStatus } from '#lib/shared/status.ts';
import type { CourseWork, Submission } from '#lib/shared/types.ts';

export type WorkSummary = CourseWork & {
	courseName: string;
	status: WorkStatus;
	late: boolean;
	assignedGrade?: number;
	draftGrade?: number;
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
		draftGrade: sub?.draftGrade
	};
}

export const byDue = (
	a: { dueAt?: number; updatedAt: number },
	b: { dueAt?: number; updatedAt: number }
) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) || b.updatedAt - a.updatedAt;
