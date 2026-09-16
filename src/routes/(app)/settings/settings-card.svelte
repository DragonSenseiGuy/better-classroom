<script lang="ts">
	import type { Snippet } from 'svelte';

	let { class: className = '', children }: { class?: string; children: Snippet } = $props();
</script>

<section class={`rounded-xl bg-card ring-1 ring-foreground/10 ${className}`}>
	{@render children()}
</section>
