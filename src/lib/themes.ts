export type Mode = 'light' | 'dark';

export type Palette = {
	bg: string;
	card: string;
	popover: string;
	sidebar: string;
	raised: string;
	border: string;
	text: string;
	subtle: string;
	primary: string;
	onPrimary: string;
	destructive: string;
	chart: [string, string, string, string, string];
};

export type Theme = {
	id: string;
	name: string;
	family: string;
	mode: Mode;
	palette: Palette;
};

export const THEMES = [
	{
		id: 'light',
		name: 'Default',
		family: 'Default',
		mode: 'light',
		palette: {
			bg: '#ffffff',
			card: '#ffffff',
			popover: '#ffffff',
			sidebar: '#fafafa',
			raised: '#f4f4f5',
			border: '#e4e4e7',
			text: '#18181b',
			subtle: '#71717a',
			primary: '#27272a',
			onPrimary: '#fafafa',
			destructive: '#dc2626',
			chart: ['#d4d4d8', '#71717a', '#52525b', '#3f3f46', '#27272a']
		}
	},
	{
		id: 'dark',
		name: 'Default',
		family: 'Default',
		mode: 'dark',
		palette: {
			bg: '#18181b',
			card: '#27272a',
			popover: '#27272a',
			sidebar: '#27272a',
			raised: '#3f3f46',
			border: '#3f3f46',
			text: '#fafafa',
			subtle: '#a1a1aa',
			primary: '#e4e4e7',
			onPrimary: '#27272a',
			destructive: '#ef4444',
			chart: ['#d4d4d8', '#71717a', '#52525b', '#3f3f46', '#27272a']
		}
	},
	{
		id: 'catppuccin-latte',
		name: 'Latte',
		family: 'Catppuccin',
		mode: 'light',
		palette: {
			bg: '#eff1f5',
			card: '#eff1f5',
			popover: '#eff1f5',
			sidebar: '#e6e9ef',
			raised: '#ccd0da',
			border: '#bcc0cc',
			text: '#4c4f69',
			subtle: '#6c6f85',
			primary: '#8839ef',
			onPrimary: '#eff1f5',
			destructive: '#d20f39',
			chart: ['#1e66f5', '#40a02b', '#df8e1d', '#ea76cb', '#179299']
		}
	},
	{
		id: 'catppuccin-frappe',
		name: 'Frappé',
		family: 'Catppuccin',
		mode: 'dark',
		palette: {
			bg: '#303446',
			card: '#292c3c',
			popover: '#292c3c',
			sidebar: '#292c3c',
			raised: '#414559',
			border: '#51576d',
			text: '#c6d0f5',
			subtle: '#a5adce',
			primary: '#ca9ee6',
			onPrimary: '#303446',
			destructive: '#e78284',
			chart: ['#8caaee', '#a6d189', '#e5c890', '#f4b8e4', '#81c8be']
		}
	},
	{
		id: 'catppuccin-macchiato',
		name: 'Macchiato',
		family: 'Catppuccin',
		mode: 'dark',
		palette: {
			bg: '#24273a',
			card: '#1e2030',
			popover: '#1e2030',
			sidebar: '#1e2030',
			raised: '#363a4f',
			border: '#494d64',
			text: '#cad3f5',
			subtle: '#a5adcb',
			primary: '#c6a0f6',
			onPrimary: '#24273a',
			destructive: '#ed8796',
			chart: ['#8aadf4', '#a6da95', '#eed49f', '#f5bde6', '#8bd5ca']
		}
	},
	{
		id: 'catppuccin-mocha',
		name: 'Mocha',
		family: 'Catppuccin',
		mode: 'dark',
		palette: {
			bg: '#1e1e2e',
			card: '#181825',
			popover: '#181825',
			sidebar: '#181825',
			raised: '#313244',
			border: '#45475a',
			text: '#cdd6f4',
			subtle: '#a6adc8',
			primary: '#cba6f7',
			onPrimary: '#1e1e2e',
			destructive: '#f38ba8',
			chart: ['#89b4fa', '#a6e3a1', '#f9e2af', '#f5c2e7', '#94e2d5']
		}
	},
	{
		id: 'ayu-light',
		name: 'Light',
		family: 'Ayu',
		mode: 'light',
		palette: {
			bg: '#fcfcfc',
			card: '#ffffff',
			popover: '#ffffff',
			sidebar: '#f8f9fa',
			raised: '#f3f4f5',
			border: '#e5e7ea',
			text: '#5c6166',
			subtle: '#8a9199',
			primary: '#ffaa33',
			onPrimary: '#242936',
			destructive: '#e65050',
			chart: ['#55b4d4', '#86b300', '#f2ae49', '#a37acc', '#ed9366']
		}
	},
	{
		id: 'ayu-mirage',
		name: 'Mirage',
		family: 'Ayu',
		mode: 'dark',
		palette: {
			bg: '#1f2430',
			card: '#1c212b',
			popover: '#1c212b',
			sidebar: '#242936',
			raised: '#2f3542',
			border: '#373e4c',
			text: '#cccac2',
			subtle: '#8a94a6',
			primary: '#ffcc66',
			onPrimary: '#1f2430',
			destructive: '#f28779',
			chart: ['#5ccfe6', '#d5ff80', '#ffd173', '#dfbfff', '#f29e74']
		}
	},
	{
		id: 'ayu-dark',
		name: 'Dark',
		family: 'Ayu',
		mode: 'dark',
		palette: {
			bg: '#0b0e14',
			card: '#0f131a',
			popover: '#0f131a',
			sidebar: '#0d1017',
			raised: '#1a1f28',
			border: '#232935',
			text: '#bfbdb6',
			subtle: '#8a9199',
			primary: '#e6b450',
			onPrimary: '#0b0e14',
			destructive: '#f07178',
			chart: ['#39bae6', '#aad94c', '#ffb454', '#d2a6ff', '#f29668']
		}
	},
	{
		id: 'rose-pine-dawn',
		name: 'Dawn',
		family: 'Rosé Pine',
		mode: 'light',
		palette: {
			bg: '#faf4ed',
			card: '#fffaf3',
			popover: '#fffaf3',
			sidebar: '#fffaf3',
			raised: '#f2e9e1',
			border: '#dfdad9',
			text: '#575279',
			subtle: '#797593',
			primary: '#286983',
			onPrimary: '#faf4ed',
			destructive: '#b4637a',
			chart: ['#d7827e', '#56949f', '#ea9d34', '#907aa9', '#286983']
		}
	},
	{
		id: 'rose-pine-moon',
		name: 'Moon',
		family: 'Rosé Pine',
		mode: 'dark',
		palette: {
			bg: '#232136',
			card: '#2a273f',
			popover: '#2a273f',
			sidebar: '#2a273f',
			raised: '#393552',
			border: '#44415a',
			text: '#e0def4',
			subtle: '#908caa',
			primary: '#c4a7e7',
			onPrimary: '#232136',
			destructive: '#eb6f92',
			chart: ['#ea9a97', '#9ccfd8', '#f6c177', '#c4a7e7', '#3e8fb0']
		}
	},
	{
		id: 'rose-pine',
		name: 'Rosé Pine',
		family: 'Rosé Pine',
		mode: 'dark',
		palette: {
			bg: '#191724',
			card: '#1f1d2e',
			popover: '#1f1d2e',
			sidebar: '#1f1d2e',
			raised: '#26233a',
			border: '#403d52',
			text: '#e0def4',
			subtle: '#908caa',
			primary: '#c4a7e7',
			onPrimary: '#191724',
			destructive: '#eb6f92',
			chart: ['#ebbcba', '#9ccfd8', '#f6c177', '#c4a7e7', '#31748f']
		}
	},
	{
		id: 'tokyo-night',
		name: 'Tokyo Night',
		family: 'Tokyo Night',
		mode: 'dark',
		palette: {
			bg: '#1a1b26',
			card: '#16161e',
			popover: '#16161e',
			sidebar: '#16161e',
			raised: '#292e42',
			border: '#3b4261',
			text: '#c0caf5',
			subtle: '#737aa2',
			primary: '#7aa2f7',
			onPrimary: '#1a1b26',
			destructive: '#f7768e',
			chart: ['#7dcfff', '#9ece6a', '#e0af68', '#bb9af7', '#ff9e64']
		}
	},
	{
		id: 'nord',
		name: 'Nord',
		family: 'Nord',
		mode: 'dark',
		palette: {
			bg: '#2e3440',
			card: '#3b4252',
			popover: '#3b4252',
			sidebar: '#3b4252',
			raised: '#434c5e',
			border: '#4c566a',
			text: '#eceff4',
			subtle: '#a5adbe',
			primary: '#88c0d0',
			onPrimary: '#2e3440',
			destructive: '#bf616a',
			chart: ['#81a1c1', '#a3be8c', '#ebcb8b', '#b48ead', '#d08770']
		}
	},
	{
		id: 'gruvbox-light',
		name: 'Light',
		family: 'Gruvbox',
		mode: 'light',
		palette: {
			bg: '#fbf1c7',
			card: '#f9f5d7',
			popover: '#f9f5d7',
			sidebar: '#f2e5bc',
			raised: '#ebdbb2',
			border: '#d5c4a1',
			text: '#3c3836',
			subtle: '#7c6f64',
			primary: '#af3a03',
			onPrimary: '#fbf1c7',
			destructive: '#9d0006',
			chart: ['#076678', '#79740e', '#b57614', '#8f3f71', '#af3a03']
		}
	},
	{
		id: 'gruvbox-dark',
		name: 'Dark',
		family: 'Gruvbox',
		mode: 'dark',
		palette: {
			bg: '#282828',
			card: '#32302f',
			popover: '#32302f',
			sidebar: '#1d2021',
			raised: '#3c3836',
			border: '#504945',
			text: '#ebdbb2',
			subtle: '#a89984',
			primary: '#fabd2f',
			onPrimary: '#282828',
			destructive: '#fb4934',
			chart: ['#83a598', '#b8bb26', '#fabd2f', '#d3869b', '#fe8019']
		}
	}
] as const satisfies readonly Theme[];

export type ThemeId = (typeof THEMES)[number]['id'];
export type ThemeChoice = ThemeId | 'system';

export const THEME_BY_ID: ReadonlyMap<string, Theme> = new Map(THEMES.map((t) => [t.id, t]));

export const LIGHT_THEMES = THEMES.filter((t) => t.mode === 'light');
export const DARK_THEMES = THEMES.filter((t) => t.mode === 'dark');

export function themeLabel(t: Theme) {
	return t.family === t.name || t.family === 'Default' ? t.name : `${t.family} ${t.name}`;
}

export function isThemeId(value: unknown): value is ThemeId {
	return typeof value === 'string' && THEME_BY_ID.has(value);
}

function vars(p: Palette) {
	return [
		['background', p.bg],
		['foreground', p.text],
		['card', p.card],
		['card-foreground', p.text],
		['popover', p.popover],
		['popover-foreground', p.text],
		['primary', p.primary],
		['primary-foreground', p.onPrimary],
		['secondary', p.raised],
		['secondary-foreground', p.text],
		['muted', p.raised],
		['muted-foreground', p.subtle],
		['accent', p.raised],
		['accent-foreground', p.text],
		['destructive', p.destructive],
		['border', p.border],
		['input', p.border],
		['ring', p.primary],
		['chart-1', p.chart[0]],
		['chart-2', p.chart[1]],
		['chart-3', p.chart[2]],
		['chart-4', p.chart[3]],
		['chart-5', p.chart[4]],
		['sidebar', p.sidebar],
		['sidebar-foreground', p.text],
		['sidebar-primary', p.primary],
		['sidebar-primary-foreground', p.onPrimary],
		['sidebar-accent', p.raised],
		['sidebar-accent-foreground', p.text],
		['sidebar-border', p.border],
		['sidebar-ring', p.primary]
	]
		.map(([k, v]) => `--${k}:${v}`)
		.join(';');
}

export const themeCss = THEMES.filter((t) => t.family !== 'Default')
	.map((t) => `html[data-theme="${t.id}"][data-mode]{${vars(t.palette)}}`)
	.join('\n');
