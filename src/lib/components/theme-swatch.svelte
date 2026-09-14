<script lang="ts">
	import type { Mode, Palette } from '#lib/themes.ts';
	import CheckIcon from '@lucide/svelte/icons/check';

	let {
		id,
		name,
		family,
		mode,
		palette,
		selected,
		onselect
	}: {
		id: string;
		name: string;
		family: string;
		mode: Mode;
		palette?: Palette;
		selected: boolean;
		onselect: () => void;
	} = $props();

	const NEUTRAL: Record<Mode, Palette> = {
		light: {
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
		},
		dark: {
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
	};
	const p = $derived(palette ?? NEUTRAL[mode]);
</script>

<button
	type="button"
	role="radio"
	aria-checked={selected}
	data-theme-id={id}
	class="group flex flex-col gap-2 rounded-xl bg-card p-2 text-left ring-1 ring-foreground/10 transition-[box-shadow,transform] outline-none hover:ring-foreground/25 focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98] aria-checked:ring-2 aria-checked:ring-primary"
	onclick={onselect}
>
	<span
		class="relative flex aspect-[4/3] w-full overflow-hidden rounded-lg"
		style:background={p.bg}
		style:border="1px solid {p.border}"
		aria-hidden="true"
	>
		<span class="flex w-[28%] flex-col gap-1 p-1.5" style:background={p.sidebar}>
			<span class="h-1 w-3/4 rounded-full" style:background={p.text}></span>
			<span class="h-1 w-1/2 rounded-full" style:background={p.subtle}></span>
			<span class="h-1 w-2/3 rounded-full" style:background={p.subtle}></span>
		</span>
		<span class="flex flex-1 flex-col gap-1.5 p-1.5">
			<span class="h-1.5 w-1/2 rounded-full" style:background={p.text}></span>
			<span
				class="flex flex-1 flex-col gap-1 rounded-md p-1.5"
				style:background={p.card}
				style:border="1px solid {p.border}"
			>
				<span class="h-1 w-2/3 rounded-full" style:background={p.subtle}></span>
				<span class="h-1 w-1/2 rounded-full" style:background={p.raised}></span>
				<span class="mt-auto flex items-center gap-1">
					<span class="h-2 w-6 rounded-sm" style:background={p.primary}></span>
					<span class="size-1.5 rounded-full" style:background={p.chart[0]}></span>
					<span class="size-1.5 rounded-full" style:background={p.chart[1]}></span>
					<span class="size-1.5 rounded-full" style:background={p.destructive}></span>
				</span>
			</span>
		</span>
		{#if selected}
			<span
				class="absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full"
				style:background={p.primary}
				style:color={p.onPrimary}><CheckIcon class="size-3" /></span
			>
		{/if}
	</span>
	<span class="flex min-w-0 items-baseline justify-between gap-2 px-1 pb-0.5">
		<span class="truncate text-sm font-medium">{name}</span>
		<span class="shrink-0 text-xs text-muted-foreground">{family}</span>
	</span>
</button>
