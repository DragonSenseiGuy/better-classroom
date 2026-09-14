import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { submissionAction, type SubmissionAction } from '#lib/server/sync.ts';

const ACTIONS: SubmissionAction[] = ['turnIn', 'reclaim'];

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as {
		action?: string;
		courseId?: string;
		workId?: string;
		submissionId?: string;
	};
	if (!ACTIONS.includes(body.action as SubmissionAction))
		error(400, 'action must be turnIn or reclaim');
	for (const key of ['courseId', 'workId', 'submissionId'] as const)
		if (typeof body[key] !== 'string' || !body[key]) error(400, `${key} is required`);
	try {
		const submission = await submissionAction(
			body.action as SubmissionAction,
			body.courseId!,
			body.workId!,
			body.submissionId!
		);
		return json({ ok: true, submission });
	} catch (err) {
		error(502, err instanceof Error ? err.message : String(err));
	}
};
