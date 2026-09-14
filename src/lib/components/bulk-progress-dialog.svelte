<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Progress } from '#lib/components/ui/progress/index.js';
	import { pluralize } from '#lib/format.ts';
	import type { Progress as ItemProgress } from '#lib/submissions.ts';
	import CheckIcon from '@lucide/svelte/icons/check';
	import XIcon from '@lucide/svelte/icons/x';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';

	let {
		open = $bindable(false),
		title,
		items
	}: { open?: boolean; title: string; items: ItemProgress[] } = $props();

	const finished = $derived(items.filter((p) => p.state === 'done' || p.state === 'failed'));
	const failed = $derived(items.filter((p) => p.state === 'failed'));
	const busy = $derived(finished.length < items.length);
	const summary = $derived(
		busy
			? `${finished.length} of ${items.length} finished`
			: failed.length
				? `${pluralize(items.length - failed.length, 'item')} done, ${failed.length} failed`
				: `All ${items.length} done`
	);
</script>

<Dialog.Root bind:open onOpenChange={(v) => (busy ? (open = true) : (open = v))}>
	<Dialog.Content showCloseButton={!busy} interactOutsideBehavior={busy ? 'ignore' : 'close'}>
		<Dialog.Header>
			<Dialog.Title>{title}</Dialog.Title>
			<Dialog.Description>{summary}</Dialog.Description>
		</Dialog.Header>
		<Progress value={items.length ? (finished.length / items.length) * 100 : 0} />
		<ul role="list" class="-mx-1 max-h-64 overflow-y-auto text-sm">
			{#each items as item (item.id)}
				<li class="flex items-start gap-2 rounded-md px-1 py-1">
					<span class="mt-0.5 grid size-4 shrink-0 place-content-center">
						{#if item.state === 'done'}<CheckIcon class="size-4 text-emerald-600" />
						{:else if item.state === 'failed'}<XIcon class="size-4 text-destructive" />
						{:else if item.state === 'running'}<Loader2Icon
								class="size-4 animate-spin text-muted-foreground"
							/>
						{:else}<span class="size-1.5 rounded-full bg-muted-foreground/40"></span>{/if}
					</span>
					<span class="min-w-0 flex-1">
						<span class="line-clamp-1 {item.state === 'pending' ? 'text-muted-foreground' : ''}"
							>{item.title}</span
						>
						{#if item.error}<span class="line-clamp-2 text-xs text-destructive">{item.error}</span
							>{/if}
					</span>
				</li>
			{/each}
		</ul>
		{#if !busy}
			<Dialog.Footer>
				<Button size="sm" onclick={() => (open = false)}>Close</Button>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
