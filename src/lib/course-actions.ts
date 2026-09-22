import { setCoursePrefs } from '#lib/api.ts';
import { displayName, type CourseRef } from '#lib/course.ts';
import { notify } from '#lib/toast.ts';

export async function setCourseHidden(course: CourseRef, hidden: boolean, description?: string) {
	if (!!course.hidden === hidden) return;
	await setCoursePrefs(course.id, { hidden });
	notify(
		hidden ? 'amber' : 'emerald',
		hidden ? `Hid ${displayName(course)}` : `${displayName(course)} is back`,
		{
			description,
			action: { label: 'Undo', onClick: () => setCoursePrefs(course.id, { hidden: !hidden }) }
		}
	);
}
