<script lang="ts">
	import type { Theme } from '#lib/themes.ts';
	import CheckIcon from '@lucide/svelte/icons/check';

	let {
		theme,
		selected,
		onselect,
		onpreview
	}: {
		theme: Theme;
		selected: boolean;
		onselect: () => void;
		onpreview: () => void;
	} = $props();

	const p = $derived(theme.palette);
	const sidebar = $derived(p.sidebar === p.bg ? p.raised : p.sidebar);
</script>

<button
	type="button"
	role="radio"
	aria-checked={selected}
	data-theme-id={theme.id}
	class="group flex flex-col gap-2 rounded-xl p-1.5 text-left ring-1 ring-foreground/10 transition-[box-shadow,transform,background-color] outline-none hover:bg-accent/60 hover:ring-foreground/25 focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.985] aria-checked:bg-accent/60 aria-checked:ring-2 aria-checked:ring-primary"
	onclick={onselect}
	onmouseenter={onpreview}
	onfocus={onpreview}
>
	<span
		class="relative flex aspect-[16/10] w-full overflow-hidden rounded-lg"
		style:background={p.bg}
		style:box-shadow="inset 0 0 0 1px {p.border}"
		aria-hidden="true"
	>
		<span class="flex w-[30%] flex-col gap-[3px] p-2" style:background={sidebar}>
			<span class="h-[3px] w-4/5 rounded-full" style:background={p.text}></span>
			<span class="h-[3px] w-3/5 rounded-full opacity-70" style:background={p.subtle}></span>
			<span class="h-[3px] w-2/3 rounded-full opacity-70" style:background={p.subtle}></span>
			<span class="mt-auto flex gap-[3px]">
				{#each p.chart.slice(0, 3) as c, i (i)}
					<span class="size-[5px] rounded-full" style:background={c}></span>
				{/each}
			</span>
		</span>
		<span class="flex flex-1 flex-col gap-[5px] p-2">
			<span class="h-1 w-1/2 rounded-full" style:background={p.text}></span>
			<span
				class="flex flex-1 flex-col gap-[3px] rounded-[5px] p-1.5"
				style:background={p.card}
				style:box-shadow="0 0 0 1px {p.border}"
			>
				<span class="h-[3px] w-3/4 rounded-full opacity-80" style:background={p.subtle}></span>
				<span class="h-[3px] w-1/2 rounded-full opacity-50" style:background={p.subtle}></span>
				<span class="mt-auto flex items-center gap-1">
					<span class="h-[7px] w-5 rounded-[3px]" style:background={p.primary}></span>
					<span class="h-[7px] w-3 rounded-[3px]" style:background={p.raised}></span>
				</span>
			</span>
		</span>
		{#if selected}
			<span
				class="absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full"
				style:background={p.primary}
				style:color={p.onPrimary}><CheckIcon class="size-3" strokeWidth={3} /></span
			>
		{/if}
	</span>
	<span class="flex min-w-0 flex-col px-1 pb-0.5 leading-tight">
		<span class="truncate text-sm font-medium">{theme.name}</span>
		<span class="truncate text-xs text-muted-foreground">
			{theme.family === theme.name || theme.family === 'Default' ? ' ' : theme.family}
		</span>
	</span>
</button>
