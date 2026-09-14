import { COLOR_CLASS, hashedColor, type ColorName } from '#lib/shared/colors.ts';

export const colorOverrides = $state<Record<string, ColorName>>({});

export function syncColorOverrides(courses: { id: string; color?: string }[]) {
	const next = new Set<string>();
	for (const c of courses) {
		if (!c.color) continue;
		next.add(c.id);
		if (colorOverrides[c.id] !== c.color) colorOverrides[c.id] = c.color as ColorName;
	}
	for (const id of Object.keys(colorOverrides)) if (!next.has(id)) delete colorOverrides[id];
}

export function courseColorName(id: string): ColorName {
	return colorOverrides[id] ?? hashedColor(id);
}

export function courseColor(id: string) {
	return COLOR_CLASS[courseColorName(id)];
}
