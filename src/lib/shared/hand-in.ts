import type { Attachment } from './types';

type Work = { workType: string; materials: Attachment[] };

/** Why Classroom refuses a plain turn-in for this work, or null when hand-in is allowed. */
export function handInBlocker(work: Work): string | null {
	if (work.workType === 'SHORT_ANSWER_QUESTION' || work.workType === 'MULTIPLE_CHOICE_QUESTION')
		return 'This is a question. Answer it in Classroom to complete it.';
	if (work.materials.some((m) => m.type === 'form'))
		return 'This assignment has a Google Form. Submit the form in Classroom to complete it.';
	return null;
}
