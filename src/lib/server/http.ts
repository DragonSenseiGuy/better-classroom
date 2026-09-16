import { error, isHttpError } from '@sveltejs/kit';
import { enrichers, type Enricher } from './providers';

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

export const readJson = <T extends object>(request: Request) =>
	request.json().catch(() => ({})) as Promise<Partial<T>>;

export function workIds(url: URL) {
	const courseId = url.searchParams.get('courseId');
	const workId = url.searchParams.get('workId');
	if (!courseId || !workId) error(400, 'courseId and workId are required');
	return { courseId, workId };
}

export function requireEnricher<K extends 'comments' | 'attachments'>(
	feature: K,
	label: string
): NonNullable<Enricher[K]> {
	const provider = enrichers().find((p) => p.enrich[feature]);
	if (!provider) error(503, `${label} need a Classroom session. Add one in Settings.`);
	return provider.enrich[feature]!;
}

export async function upstream<T>(work: () => Promise<T>): Promise<T> {
	try {
		return await work();
	} catch (err) {
		if (isHttpError(err)) throw err;
		console.error('upstream request failed', err);
		error(424, errorMessage(err));
	}
}
