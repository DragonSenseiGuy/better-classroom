<script lang="ts">
	import { theme, setMode, setTheme, previewTheme, endPreview } from '#lib/theme.svelte.ts';
	import { LIGHT_THEMES, DARK_THEMES } from '#lib/themes.ts';
	import ThemeCard from '#lib/components/theme-card.svelte';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import SunIcon from '@lucide/svelte/icons/sun';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import MonitorIcon from '@lucide/svelte/icons/monitor';
	import SettingsCard from './settings-card.svelte';

	let previewTimer: ReturnType<typeof setTimeout> | undefined;
	function stickyPreview(id: Parameters<typeof previewTheme>[0]) {
		clearTimeout(previewTimer);
		previewTheme(id);
	}
	function leaveGroup() {
		clearTimeout(previewTimer);
		previewTimer = setTimeout(endPreview, 150);
	}
	function focusOutGroup(e: FocusEvent) {
		const group = e.currentTarget as HTMLElement;
		if (!group.contains(e.relatedTarget as Node | null)) leaveGroup();
	}
</script>

<SettingsCard class="max-w-3xl">
	<div class="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
		<div>
			<h2 class="text-base font-semibold tracking-tight">Mode</h2>
			<p class="mt-1 text-sm text-muted-foreground">
				System switches between your light and dark themes with your OS.
			</p>
		</div>
		<ToggleGroup.Root
			type="single"
			variant="outline"
			value={theme.mode}
			onValueChange={(v) => v && setMode(v as typeof theme.mode)}
		>
			<ToggleGroup.Item value="system" aria-label="System"
				><MonitorIcon data-icon="inline-start" />System</ToggleGroup.Item
			>
			<ToggleGroup.Item value="light" aria-label="Light"
				><SunIcon data-icon="inline-start" />Light</ToggleGroup.Item
			>
			<ToggleGroup.Item value="dark" aria-label="Dark"
				><MoonIcon data-icon="inline-start" />Dark</ToggleGroup.Item
			>
		</ToggleGroup.Root>
	</div>
	{#each [['light', LIGHT_THEMES], ['dark', DARK_THEMES]] as const as [mode, list] (mode)}
		{@const active = theme.resolved === mode}
		<div
			class="border-t px-5 py-4 transition-opacity {active ? '' : 'opacity-60 hover:opacity-100'}"
		>
			<div class="flex items-center gap-2">
				<h3 class="text-sm font-semibold tracking-tight">
					{mode === 'light' ? 'Light theme' : 'Dark theme'}
				</h3>
				{#if active}<Badge variant="secondary">Active</Badge>{/if}
			</div>
			<div
				role="radiogroup"
				aria-label="{mode} theme"
				class="mt-3 grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3"
				tabindex="-1"
				onmouseleave={leaveGroup}
				onfocusout={focusOutGroup}
			>
				{#each list as t (t.id)}
					<ThemeCard
						theme={t}
						selected={theme[mode] === t.id}
						onselect={() => setTheme(t.id)}
						onpreview={() => stickyPreview(t.id)}
					/>
				{/each}
			</div>
		</div>
	{/each}
	<p class="border-t px-5 py-3 text-xs text-muted-foreground">
		Hover a theme to try it on. Saved for this browser only.
	</p>
</SettingsCard>
