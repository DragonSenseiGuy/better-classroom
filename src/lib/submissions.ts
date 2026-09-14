import type { WorkSummary } from './work';

export type SubmissionAction = 'turnIn' | 'reclaim';
export type ItemState = 'pending' | 'running' | 'done' | 'failed';
export type Progress = { id: string; title: string; state: ItemState; error?: string };

const CONCURRENCY = 4;

async function run(action: SubmissionAction, w: WorkSummary) {
	const res = await fetch('/api/submissions', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			action,
			courseId: w.courseId,
			workId: w.id,
			submissionId: w.submissionId
		})
	});
	if (!res.ok) throw new Error((await res.text()).replace(/^.*"message":"([^"]*)".*$/s, '$1'));
}

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
				progress[i].error = err instanceof Error ? err.message : String(err);
			}
			emit();
		}
	};
	await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
	return progress;
}
