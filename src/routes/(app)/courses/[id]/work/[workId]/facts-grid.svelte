<script lang="ts">
	let { facts }: { facts: { label: string; value: string; hint?: string }[] } = $props();
</script>

<dl class="mt-6 grid grid-cols-2 gap-y-4 sm:grid-cols-4">
	{#each facts as fact, i (fact.label)}
		<div
			class={`border-border/60 ${i % 2 === 1 ? 'border-l pl-4' : 'pr-4'} ${i >= 2 ? 'sm:border-l sm:pl-4' : ''} ${i === 2 ? 'max-sm:pl-0' : ''}`}
		>
			<dt class="truncate text-sm text-muted-foreground">{fact.label}</dt>
			<dd class="mt-0.5 text-sm font-medium tabular-nums">{fact.value}</dd>
			{#if fact.hint && fact.hint !== fact.value}<dd
					class="text-xs text-muted-foreground tabular-nums"
				>
					{fact.hint}
				</dd>{/if}
		</div>
	{/each}
</dl>
