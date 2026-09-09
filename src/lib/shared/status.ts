export type WorkStatus = 'graded' | 'returned' | 'turnedIn' | 'missing' | 'assigned';

export function workStatus(
	sub: { state: string; assignedGrade?: number; late?: boolean } | null | undefined,
	dueAt: number | undefined,
	now: number
): WorkStatus {
	if (sub) {
		if (sub.assignedGrade !== undefined) return 'graded';
		if (sub.state === 'RETURNED') return 'returned';
		if (sub.state === 'TURNED_IN') return 'turnedIn';
	}
	if (dueAt !== undefined && dueAt < now) return 'missing';
	return 'assigned';
}
