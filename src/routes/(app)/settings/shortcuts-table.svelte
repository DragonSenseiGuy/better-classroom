<script lang="ts">
	import { Kbd, KbdGroup } from '#lib/components/ui/kbd/index.js';

	const shortcuts = [
		[['⌘', 'K'], 'Search and jump anywhere'],
		[['G', 'H'], 'Go home'],
		[['G', 'I'], 'Go to Inbox'],
		[['G', 'T'], 'Go to To-do'],
		[['G', 'S'], 'Go to Settings'],
		[['J'], 'Inbox: next item'],
		[['K'], 'Inbox: previous item'],
		[['E'], 'Inbox: mark done or undo'],
		[['↵'], 'Inbox: open item']
	] as const;
</script>

<dl class="grid max-w-md grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
	{#each shortcuts as [keys, label] (label)}
		<dt>
			<KbdGroup
				>{#each keys as k (k)}<Kbd>{k}</Kbd>{/each}</KbdGroup
			>
		</dt>
		<dd class="text-muted-foreground">{label}</dd>
	{/each}
</dl>
