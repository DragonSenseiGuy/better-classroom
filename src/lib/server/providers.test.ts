import { test, expect } from 'bun:test';
import {
	enrichers,
	providerStatuses,
	recordProvider,
	recordSource,
	registerProviders,
	type Provider
} from './providers.ts';
import type { ProviderStatus } from '#lib/shared/types.ts';

const status = (patch: Partial<ProviderStatus>): ProviderStatus => ({
	id: 'apps-script',
	label: 'x',
	role: 'records',
	state: 'ready',
	active: false,
	...patch
});

const records = {
	overview: async () => ({ profile: { id: 'me' }, courses: [] }),
	courseContent: async () => ({}),
	lookup: async () => ({}),
	submissionAction: async () => {
		throw new Error('unused');
	}
};

let secondaryState: ProviderStatus['state'] = 'off';
let webState: ProviderStatus['state'] = 'off';

const secondary: Provider = {
	status: () => status({ label: 'secondary', state: secondaryState }),
	records
};
const appsScript: Provider = {
	status: () => status({ state: 'ready' }),
	records
};
const web: Provider = {
	status: () => status({ id: 'web', role: 'enrichment', state: webState }),
	enrich: { enrich: async () => null, keepAlive: async () => undefined }
};

registerProviders(secondary, appsScript, web);

test('the first usable record provider is primary', () => {
	expect(recordProvider()).toBe(appsScript);
	expect(recordSource()).toBe(records);
	secondaryState = 'ready';
	expect(recordProvider()).toBe(secondary);
	secondaryState = 'off';
});

test('enrichers are only the usable enrichment providers', () => {
	expect(enrichers()).toEqual([]);
	webState = 'expired';
	expect(enrichers().map((p) => p.status().id)).toEqual(['web']);
	webState = 'off';
});

test('statuses mark the primary source and active enrichers', () => {
	webState = 'ready';
	expect(providerStatuses().map((s) => [s.label, s.state, s.active])).toEqual([
		['secondary', 'off', false],
		['x', 'ready', true],
		['x', 'ready', true]
	]);
	webState = 'off';
});
