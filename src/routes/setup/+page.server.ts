import type { PageServerLoad } from './$types';
import appsScriptSource from '../../../apps-script/Code.js?raw';
import manifestSource from '../../../apps-script/appsscript.json?raw';
import { isConfigured } from '#lib/server/config.ts';
import { hasGoogleClient, isGoogleConnected } from '#lib/server/google.ts';

export const load: PageServerLoad = ({ url }) => ({
	title: 'Set up',
	configured: isConfigured(),
	googleClient: hasGoogleClient(),
	googleConnected: isGoogleConnected(),
	authError: url.searchParams.get('error'),
	appsScriptSource,
	manifestSource
});
