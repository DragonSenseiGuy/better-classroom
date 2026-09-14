<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';

	let { name, source }: { name: string; source: string } = $props();
	let copied = $state(false);
	let expanded = $state(false);
	const lines = $derived(source.split('\n').length);

	async function copy() {
		await navigator.clipboard.writeText(source);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<div class="overflow-hidden rounded-lg border bg-muted/40">
	<div class="flex items-center gap-2 border-b bg-muted/60 py-1.5 pr-1.5 pl-3">
		<code class="text-xs font-medium">{name}</code>
		<span class="text-xs text-muted-foreground">{lines} lines</span>
		<Button
			variant="ghost"
			size="xs"
			class="ml-auto text-muted-foreground"
			aria-expanded={expanded}
			onclick={() => (expanded = !expanded)}
		>
			<ChevronDownIcon
				data-icon="inline-start"
				class={`transition-transform ${expanded ? 'rotate-180' : ''}`}
			/>
			{expanded ? 'Hide' : 'Show'}
		</Button>
		<Button variant={copied ? 'secondary' : 'default'} size="xs" onclick={copy}>
			{#if copied}<CheckIcon data-icon="inline-start" />Copied{:else}<CopyIcon
					data-icon="inline-start"
				/>Copy {name}{/if}
		</Button>
	</div>
	{#if expanded}
		<pre class="max-h-72 overflow-auto p-3 text-[11px] leading-4 whitespace-pre"><code
				>{source}</code
			></pre>
	{/if}
</div>
