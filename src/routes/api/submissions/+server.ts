import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readJson, upstream } from '#lib/server/http.ts';
import { submissionAction, type SubmissionAction } from '#lib/server/sync.ts';

const ACTIONS: SubmissionAction[] = ['turnIn', 'reclaim'];

export const POST: RequestHandler = async ({ request }) => {
	const body = await readJson<{
		action: SubmissionAction;
		courseId: string;
		workId: string;
		submissionId: string;
	}>(request);
	const { action, courseId, workId, submissionId } = body;
	if (!action || !ACTIONS.includes(action)) error(400, 'action must be turnIn or reclaim');
	if (!courseId) error(400, 'courseId is required');
	if (!workId) error(400, 'workId is required');
	if (!submissionId) error(400, 'submissionId is required');
	const submission = await upstream(() => submissionAction(action, courseId, workId, submissionId));
	return json({ ok: true, submission });
};
