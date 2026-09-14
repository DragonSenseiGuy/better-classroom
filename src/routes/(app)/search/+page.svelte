<script lang="ts">
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import type { SearchHit } from '#lib/shared/fuzzy.ts';
	import type { SearchDoc } from '#lib/shared/types.ts';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import * as Item from '#lib/components/ui/item/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { courseColor, formatDue, formatRelative } from '#lib/format.ts';
	import SearchIcon from '@lucide/svelte/icons/search';
	import ClipboardListIcon from '@lucide/svelte/icons/clipboard-list';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import MegaphoneIcon from '@lucide/svelte/icons/megaphone';

	let { data } = $props();
	let query = $state(untrack(() => data.q));
	const trimmed = $derived(query.trim());
	let hits = $state<SearchHit<SearchDoc>[]>([]);
	let loading = $state(false);
	let controller: AbortController | undefined;
	$effect(() => {
		const q = trimmed;
		controller?.abort();
		if (!q) {
			hits = [];
			return;
		}
		const c = (controller = new AbortController());
		loading = true;
		fetch(`/api/search?q=${encodeURIComponent(q)}&limit=50`, { signal: c.signal })
			.then((r) => r.json())
			.then((res: SearchHit<SearchDoc>[]) => {
				if (!c.signal.aborted) hits = res;
			})
			.catch(() => {})
			.finally(() => {
				if (!c.signal.aborted) loading = false;
			});
	});

	const kindIcon = {
		work: ClipboardListIcon,
		material: BookOpenIcon,
		announcement: MegaphoneIcon,
		course: BookOpenIcon
	} as const;
	const kindLabel = {
		work: 'Assignment',
		material: 'Material',
		announcement: 'Announcement',
		course: 'Course'
	} as const;

	let timer: ReturnType<typeof setTimeout>;
	function onInput() {
		clearTimeout(timer);
		timer = setTimeout(() => {
			const url = new URL(location.href);
			if (trimmed) url.searchParams.set('q', trimmed);
			else url.searchParams.delete('q');
			goto(url, { replace: true, shallow: true });
		}, 250);
	}
</script>

<h1 class="text-2xl font-semibold tracking-tight">Search</h1>
<form class="mt-4 max-w-xl" onsubmit={(e) => e.preventDefault()} role="search">
	<div class="relative">
		<SearchIcon
			class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
		/>
		<Input
			name="q"
			type="search"
			bind:value={query}
			oninput={onInput}
			placeholder="Search assignments, materials, announcements…"
			aria-label="Search"
			class="h-10 pl-9 max-sm:text-base/6"
			autofocus
		/>
	</div>
</form>

{#if trimmed}
	<p class="mt-4 text-sm text-muted-foreground tabular-nums">
		{#if loading && !hits.length}Searching…{:else}{hits.length} result{hits.length === 1 ? '' : 's'} for
			“{trimmed}”{/if}
	</p>
{/if}

{#if trimmed && hits.length === 0 && !loading}
	<Empty.Root class="mt-6 border border-dashed">
		<Empty.Header>
			<Empty.Media variant="icon"><SearchIcon /></Empty.Media>
			<Empty.Title>No results</Empty.Title>
			<Empty.Description>Try a different spelling, or fewer words.</Empty.Description>
		</Empty.Header>
	</Empty.Root>
{:else if hits.length}
	<div class="mt-2 flex flex-col divide-y divide-border/60">
		{#each hits as hit (hit.doc.kind + hit.doc.id)}
			{@const Icon = kindIcon[hit.doc.kind]}
			<Item.Root size="sm" class="-mx-3 rounded-none py-3">
				{#snippet child({ props })}
					<a href={hit.doc.href} {...props}>
						<Item.Media variant="icon" class="text-muted-foreground"><Icon /></Item.Media>
						<Item.Content>
							<Item.Title class="line-clamp-1">{hit.doc.title}</Item.Title>
							{#if hit.doc.snippet && hit.doc.kind !== 'announcement'}
								<p class="line-clamp-2 text-sm text-muted-foreground">{hit.doc.snippet}</p>
							{/if}
							<Item.Description class="flex items-center gap-1.5">
								<span class={`size-1.5 shrink-0 rounded-full ${courseColor(hit.doc.courseId)}`}
								></span>
								<span class="truncate">{hit.doc.courseName}</span>
								<span aria-hidden="true">·</span>
								<span class="tabular-nums"
									>{hit.doc.dueAt
										? formatDue(hit.doc.dueAt, true)
										: formatRelative(hit.doc.updatedAt)}</span
								>
							</Item.Description>
						</Item.Content>
						<Item.Actions><Badge variant="secondary">{kindLabel[hit.doc.kind]}</Badge></Item.Actions
						>
					</a>
				{/snippet}
			</Item.Root>
		{/each}
	</div>
{/if}
