import type {
	RawCourseContent,
	RawLookup,
	RawOverview,
	RawSubmissionAction
} from './classroom';
import type { Change, CollectionName, ProviderStatus, RichStatus } from '#lib/shared/types.ts';

export type Publish = (collection: CollectionName, changes: Change[]) => void;

/**
 * The record methods the sync needs from whichever provider owns courses,
 * posts and submissions. Apps Script and direct OAuth both serve the REST
 * API's shapes, so they share this contract with different transports.
 */
export type RecordSource = {
	overview(since: number): Promise<RawOverview>;
	courseContent(courseId: string, since: number, wantSubmissions: boolean): Promise<RawCourseContent>;
	lookup(courseId: string, users: string[]): Promise<RawLookup>;
	submissionAction(
		action: 'turnIn' | 'reclaim',
		courseId: string,
		workId: string,
		submissionId: string
	): Promise<RawSubmissionAction>;
};

/**
 * Adds what the record source cannot see, layered onto rows it created:
 * formatted HTML, web-side authors, classmates. Runs after every sync.
 */
export type Enricher = {
	enrich(options: { full?: boolean }, publish: Publish): Promise<RichStatus | null>;
	keepAlive(): Promise<unknown>;
};

export type Provider = {
	status(): ProviderStatus;
	records?: RecordSource;
	enrich?: Enricher;
};

const registry: Provider[] = [];

/** Registration order is priority: the first usable record source wins. */
export function registerProviders(...providers: Provider[]) {
	registry.push(...providers);
}

const usable = (p: Provider) => p.status().state !== 'off';

export const recordProvider = () => registry.find((p) => p.records && usable(p)) ?? null;

export const hasRecordSource = () => recordProvider() !== null;

export function recordSource(): RecordSource {
	const provider = recordProvider();
	if (!provider?.records) throw new Error('No Classroom source is connected. Finish setup at /setup.');
	return provider.records;
}

export const enrichers = () =>
	registry.filter((p): p is Provider & { enrich: Enricher } => Boolean(p.enrich) && usable(p));

export function providerStatuses(): ProviderStatus[] {
	const primary = recordProvider();
	return registry.map((p) => {
		const status = p.status();
		return { ...status, active: status.role === 'records' ? p === primary : status.state !== 'off' };
	});
}
