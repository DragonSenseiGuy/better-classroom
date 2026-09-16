import type { PageServerLoad } from './$types';
import appsScriptSource from '../../../apps-script/Code.js?raw';
import manifestSource from '../../../apps-script/appsscript.json?raw';
import { isConfigured } from '#lib/server/config.ts';

export const load: PageServerLoad = () => ({
	title: 'Set up',
	configured: isConfigured(),
	appsScriptSource,
	manifestSource
});
