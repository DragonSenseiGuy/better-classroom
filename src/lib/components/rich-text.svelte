<script lang="ts">
	import { richSegments } from '#lib/rich-text.ts';
	import { sanitizeHtml } from '#lib/rich-html.ts';

	let {
		text,
		html,
		class: className = ''
	}: { text: string; html?: string; class?: string } = $props();
	const segments = $derived(html ? [] : richSegments(text));
	const safe = $derived(html ? sanitizeHtml(html) : '');
</script>

{#if html}
	<div class={`rich ${className}`}>{@html safe}</div>
{:else}
	<p class={`whitespace-pre-wrap ${className}`}>
		{#each segments as s, i (i)}
			{#if s.href}
				<a
					href={s.href}
					target="_blank"
					rel="noopener noreferrer"
					class="break-all text-primary underline underline-offset-2 hover:opacity-80"
					class:font-semibold={s.bold}
					class:italic={s.italic}>{s.text}</a
				>
			{:else if s.bold || s.italic}
				<span class:font-semibold={s.bold} class:italic={s.italic}>{s.text}</span>
			{:else}{s.text}{/if}
		{/each}
	</p>
{/if}

<style>
	.rich :global(strong) {
		font-weight: 600;
	}
</style>
