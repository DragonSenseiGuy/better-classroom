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
	id: 'google',
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

let googleState: ProviderStatus['state'] = 'off';
let webState: ProviderStatus['state'] = 'off';

const google: Provider = {
	status: () => status({ id: 'google', state: googleState }),
	records
};
const appsScript: Provider = {
	status: () => status({ id: 'apps-script', state: 'ready' }),
	records
};
const web: Provider = {
	status: () => status({ id: 'web', role: 'enrichment', state: webState }),
	enrich: { enrich: async () => null, keepAlive: async () => undefined }
};

registerProviders(google, appsScript, web);

test('the first usable record provider is primary', () => {
	expect(recordProvider()).toBe(appsScript);
	expect(recordSource()).toBe(records);
	googleState = 'ready';
	expect(recordProvider()).toBe(google);
	googleState = 'off';
});

test('enrichers are only the usable enrichment providers', () => {
	expect(enrichers()).toEqual([]);
	webState = 'expired';
	expect(enrichers().map((p) => p.status().id)).toEqual(['web']);
	webState = 'off';
});

test('statuses mark the primary source and active enrichers', () => {
	webState = 'ready';
	expect(providerStatuses().map((s) => [s.id, s.state, s.active])).toEqual([
		['google', 'off', false],
		['apps-script', 'ready', true],
		['web', 'ready', true]
	]);
	webState = 'off';
});
