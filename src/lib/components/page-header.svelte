<script lang="ts">
	import type { Snippet } from 'svelte';
	let {
		title,
		description,
		children,
		actions
	}: { title: string; description?: string; children?: Snippet; actions?: Snippet } = $props();
</script>

<div class="flex flex-wrap items-start justify-between gap-4">
	<div class="min-w-0">
		<h1 class="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
		{#if description}<p class="mt-1 text-sm text-pretty text-muted-foreground">
				{description}
			</p>{/if}
		{#if children}<div class="mt-2">{@render children()}</div>{/if}
	</div>
	{#if actions}<div class="flex shrink-0 items-center gap-2">{@render actions()}</div>{/if}
</div>
