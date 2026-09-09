import appsScriptSource from '../../../apps-script/Code.js?raw';
import manifestSource from '../../../apps-script/appsscript.json?raw';

export const load = () => ({
	title: 'Settings',
	crumbs: [{ label: 'Settings' }],
	appsScriptSource,
	manifestSource
});
