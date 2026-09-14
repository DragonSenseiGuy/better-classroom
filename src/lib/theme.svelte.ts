import { browser } from '$app/env';
import { THEME_BY_ID, isThemeId, type Mode, type ThemeChoice } from '#lib/themes.ts';

const STORAGE = 'theme';
const STORAGE_MODE = 'theme-mode';

export const theme = $state<{ choice: ThemeChoice; mode: Mode }>({
	choice: 'system',
	mode: 'light'
});

function systemMode(): Mode {
	return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function apply() {
	const html = document.documentElement;
	const t = theme.choice === 'system' ? undefined : THEME_BY_ID.get(theme.choice);
	theme.mode = t?.mode ?? systemMode();
	if (t) html.dataset.theme = t.id;
	else delete html.dataset.theme;
	html.dataset.mode = theme.mode;
}

export function setTheme(choice: ThemeChoice) {
	theme.choice = choice;
	apply();
	try {
		if (choice === 'system') {
			localStorage.removeItem(STORAGE);
			localStorage.removeItem(STORAGE_MODE);
		} else {
			localStorage.setItem(STORAGE, choice);
			localStorage.setItem(STORAGE_MODE, theme.mode);
		}
	} catch {}
}

if (browser) {
	try {
		const saved = localStorage.getItem(STORAGE);
		theme.choice = isThemeId(saved) ? saved : 'system';
	} catch {}
	apply();
	matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
		if (theme.choice === 'system') apply();
	});
}
