import { browser } from '$app/env';
import { THEME_BY_ID, isThemeId, type Mode, type ThemeId } from '#lib/themes.ts';

export type ModePref = Mode | 'system';

const KEY_MODE = 'theme.mode';
const KEY_LIGHT = 'theme.light';
const KEY_DARK = 'theme.dark';

export const theme = $state<{ mode: ModePref; light: ThemeId; dark: ThemeId; resolved: Mode }>({
	mode: 'system',
	light: 'light',
	dark: 'dark',
	resolved: 'light'
});

let previewing: ThemeId | null = null;

function systemMode(): Mode {
	return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function activeThemeId(): ThemeId {
	return theme.resolved === 'dark' ? theme.dark : theme.light;
}

function paint(id: ThemeId) {
	const html = document.documentElement;
	html.dataset.theme = id;
	html.dataset.mode = THEME_BY_ID.get(id)!.mode;
}

function apply() {
	theme.resolved = theme.mode === 'system' ? systemMode() : theme.mode;
	paint(previewing ?? activeThemeId());
}

function persist() {
	try {
		localStorage.setItem(KEY_MODE, theme.mode);
		localStorage.setItem(KEY_LIGHT, theme.light);
		localStorage.setItem(KEY_DARK, theme.dark);
	} catch {}
}

export function setMode(mode: ModePref) {
	theme.mode = mode;
	apply();
	persist();
}

export function setTheme(id: ThemeId) {
	const t = THEME_BY_ID.get(id)!;
	if (t.mode === 'dark') theme.dark = id;
	else theme.light = id;
	previewing = null;
	apply();
	persist();
}

export function previewTheme(id: ThemeId) {
	previewing = id;
	paint(id);
}

export function endPreview() {
	previewing = null;
	apply();
}

if (browser) {
	try {
		const mode = localStorage.getItem(KEY_MODE);
		const light = localStorage.getItem(KEY_LIGHT);
		const dark = localStorage.getItem(KEY_DARK);
		if (mode === 'light' || mode === 'dark' || mode === 'system') theme.mode = mode;
		if (isThemeId(light) && THEME_BY_ID.get(light)!.mode === 'light') theme.light = light;
		if (isThemeId(dark) && THEME_BY_ID.get(dark)!.mode === 'dark') theme.dark = dark;
	} catch {}
	apply();
	matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
		if (theme.mode === 'system') apply();
	});
}
