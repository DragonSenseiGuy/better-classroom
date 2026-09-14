export const COLOR_NAMES = [
	'emerald',
	'amber',
	'sky',
	'rose',
	'violet',
	'teal',
	'orange',
	'fuchsia',
	'lime',
	'cyan'
] as const;

export type ColorName = (typeof COLOR_NAMES)[number];

export const COLOR_CLASS: Record<ColorName, string> = {
	emerald: 'bg-emerald-500',
	amber: 'bg-amber-500',
	sky: 'bg-sky-500',
	rose: 'bg-rose-500',
	violet: 'bg-violet-500',
	teal: 'bg-teal-500',
	orange: 'bg-orange-500',
	fuchsia: 'bg-fuchsia-500',
	lime: 'bg-lime-500',
	cyan: 'bg-cyan-500'
};

export function hashedColor(id: string): ColorName {
	let h = 0;
	for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
	return COLOR_NAMES[h % COLOR_NAMES.length]!;
}
