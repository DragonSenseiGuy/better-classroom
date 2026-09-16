<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { pluralize } from '#lib/text.ts';
	import CheckCheckIcon from '@lucide/svelte/icons/check-check';
	import UndoIcon from '@lucide/svelte/icons/undo-2';
	import XIcon from '@lucide/svelte/icons/x';

	let {
		count,
		turnInable,
		reclaimable,
		busy,
		onTurnIn,
		onReclaim,
		onClear
	}: {
		count: number;
		turnInable: number;
		reclaimable: number;
		busy: boolean;
		onTurnIn: () => void;
		onReclaim: () => void;
		onClear: () => void;
	} = $props();
</script>

<div
	class="fixed bottom-6 left-1/2 z-20 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10 md:left-[calc(50%+var(--sidebar-width,0px)/2)]"
	role="toolbar"
	aria-label="Selection actions"
>
	<span class="font-medium tabular-nums">{pluralize(count, 'assignment')} selected</span>
	<span class="hidden text-muted-foreground sm:inline">·</span>
	<Button size="sm" disabled={!turnInable || busy} onclick={onTurnIn}>
		<CheckCheckIcon data-icon="inline-start" />Mark {turnInable === count
			? 'as done'
			: `${turnInable} as done`}
	</Button>
	<Button size="sm" variant="outline" disabled={!reclaimable || busy} onclick={onReclaim}>
		<UndoIcon data-icon="inline-start" />Unsubmit{reclaimable !== count ? ` ${reclaimable}` : ''}
	</Button>
	<Button size="sm" variant="ghost" onclick={onClear} aria-label="Clear selection">
		<XIcon data-icon="inline-start" />Clear
	</Button>
</div>
