import { errorMessage, submitWork, type SubmissionAction } from '#lib/api.ts';
import type { WorkSummary } from '#lib/work.ts';

export type { SubmissionAction };
export type ItemState = 'pending' | 'running' | 'done' | 'failed';
export type Progress = { id: string; title: string; state: ItemState; error?: string };

const CONCURRENCY = 4;

const run = (action: SubmissionAction, w: WorkSummary) =>
	submitWork(action, { courseId: w.courseId, workId: w.id, submissionId: w.submissionId });

export async function runBatch(
	action: SubmissionAction,
	items: WorkSummary[],
	onProgress: (progress: Progress[]) => void
) {
	const progress: Progress[] = items.map((w) => ({ id: w.id, title: w.title, state: 'pending' }));
	const emit = () => onProgress(progress.map((p) => ({ ...p })));
	emit();
	let next = 0;
	const worker = async () => {
		for (let i = next++; i < items.length; i = next++) {
			progress[i].state = 'running';
			emit();
			try {
				await run(action, items[i]);
				progress[i].state = 'done';
			} catch (err) {
				progress[i].state = 'failed';
				progress[i].error = errorMessage(err);
			}
			emit();
		}
	};
	await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
	return progress;
}
