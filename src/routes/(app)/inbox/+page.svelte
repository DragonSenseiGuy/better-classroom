<script lang="ts">
	import { useLiveQuery } from '@tanstack/svelte-db';
	import { WindowVirtualizer, type WindowVirtualizerHandle } from 'virtua/svelte';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import { allDismissals, inboxAnnouncements, inboxKey, inboxMaterials } from '#lib/db/queries.ts';
	import { setDismissed } from '#lib/api.ts';
	import { celebrate } from '#lib/celebrate.ts';
	import { notify } from '#lib/toast.ts';
	import PageHeader from '#lib/components/page-header.svelte';
	import Announcement from '#lib/components/announcement.svelte';
	import Attachments from '#lib/components/attachments.svelte';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Kbd, KbdGroup } from '#lib/components/ui/kbd/index.js';
	import { formatRelative } from '#lib/format.ts';
	import { displayName } from '#lib/course.ts';
	import { pluralize } from '#lib/text.ts';
	import CourseDot from '#lib/components/course-dot.svelte';
	import type { Announcement as AnnouncementRow, Course, Material } from '#lib/shared/types.ts';
	import CheckIcon from '@lucide/svelte/icons/check';
	import UndoIcon from '@lucide/svelte/icons/undo-2';
	import PartyPopperIcon from '@lucide/svelte/icons/party-popper';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import CheckCheckIcon from '@lucide/svelte/icons/check-check';

	const announcementQuery = useLiveQuery({ query: inboxAnnouncements });
	const materialQuery = useLiveQuery({ query: inboxMaterials });
	const dismissalQuery = useLiveQuery({ query: allDismissals });

	type Item =
		| {
				key: string;
				kind: 'announcement';
				at: number;
				course: Course;
				announcement: AnnouncementRow;
		  }
		| { key: string; kind: 'material'; at: number; course: Course; material: Material };

	type Filter = 'all' | 'announcements' | 'materials';
	let filter = $state<Filter>('all');
	let showDone = $state(false);

	const dismissed = $derived(new Set(dismissalQuery.data.map((d) => d.id)));
	const items = $derived.by(() => {
		const out: Item[] = [];
		for (const r of announcementQuery.data)
			out.push({
				key: inboxKey('announcement', r.a.id),
				kind: 'announcement',
				at: r.a.updatedAt,
				course: r.c,
				announcement: r.a
			});
		for (const r of materialQuery.data)
			out.push({
				key: inboxKey('material', r.m.id),
				kind: 'material',
				at: r.m.updatedAt,
				course: r.c,
				material: r.m
			});
		return out.sort((a, b) => b.at - a.at);
	});
	const pending = $derived(items.filter((i) => !dismissed.has(i.key)));
	const visible = $derived(
		(showDone ? items : pending).filter((i) =>
			filter === 'all'
				? true
				: filter === 'announcements'
					? i.kind === 'announcement'
					: i.kind === 'material'
		)
	);

	let lastPending = $state<number | null>(null);
	let justCleared = $state(false);
	$effect(() => {
		const n = pending.length;
		if (lastPending !== null && lastPending > 0 && n === 0) {
			justCleared = true;
			celebrate();
		}
		if (n > 0) justCleared = false;
		lastPending = n;
	});

	const label = (item: Item) =>
		item.kind === 'announcement' ? item.announcement.text.slice(0, 60) : item.material.title;

	async function done(item: Item) {
		await setDismissed([item.key], true);
		notify('emerald', 'Done', {
			description: label(item),
			action: { label: 'Undo', onClick: () => setDismissed([item.key], false) }
		});
	}

	async function undo(item: Item) {
		await setDismissed([item.key], false);
	}

	async function doneAll() {
		const keys = visible.filter((i) => !dismissed.has(i.key)).map((i) => i.key);
		if (!keys.length) return;
		await setDismissed(keys, true);
		notify('violet', `Marked ${pluralize(keys.length, 'item')} done`, {
			action: { label: 'Undo', onClick: () => setDismissed(keys, false) }
		});
	}

	let selected = $state(-1);
	let virtualizer = $state<WindowVirtualizerHandle>();
	$effect(() => {
		if (selected >= visible.length) selected = visible.length - 1;
	});
	function move(delta: number) {
		if (!visible.length) return;
		selected = Math.max(0, Math.min(visible.length - 1, selected < 0 ? 0 : selected + delta));
		virtualizer?.scrollToIndex(selected, { align: 'nearest', offset: -80 });
	}
	createHotkey('J', () => move(1), { ignoreInputs: true });
	createHotkey('K', () => move(-1), { ignoreInputs: true });
	createHotkey('E', () => toggleSelected(), { ignoreInputs: true });
	createHotkey('Enter', () => openSelected(), { ignoreInputs: true });
	function toggleSelected() {
		const item = visible[selected];
		if (!item) return;
		if (dismissed.has(item.key)) void undo(item);
		else void done(item);
	}
	function openSelected() {
		const item = visible[selected];
		if (!item) return;
		location.assign(
			item.kind === 'announcement'
				? `/courses/${item.course.id}?tab=stream#a-${item.announcement.id}`
				: `/courses/${item.course.id}/material/${item.material.id}`
		);
	}
</script>

<PageHeader
	title="Inbox"
	description={pending.length
		? `${pluralize(pending.length, 'post')} to look at across your courses.`
		: 'Every post across your courses, done.'}
>
	{#snippet actions()}
		<ToggleGroup.Root
			type="single"
			variant="outline"
			size="sm"
			bind:value={filter}
			onValueChange={(v) => !v && (filter = 'all')}
		>
			<ToggleGroup.Item value="all">All</ToggleGroup.Item>
			<ToggleGroup.Item value="announcements">Posts</ToggleGroup.Item>
			<ToggleGroup.Item value="materials">Materials</ToggleGroup.Item>
		</ToggleGroup.Root>
		<Button variant="outline" size="sm" onclick={() => (showDone = !showDone)}
			>{showDone ? 'Hide done' : 'Show done'}</Button
		>
		{#if visible.some((i) => !dismissed.has(i.key))}
			<Button size="sm" onclick={doneAll}
				><CheckCheckIcon data-icon="inline-start" />Mark all done</Button
			>
		{/if}
	{/snippet}
</PageHeader>

{#if visible.length === 0}
	<Empty.Root class="mt-6 border border-dashed">
		<Empty.Header>
			<Empty.Media variant="icon"><PartyPopperIcon /></Empty.Media>
			<Empty.Title>{justCleared ? 'Inbox zero!' : 'Nothing here'}</Empty.Title>
			<Empty.Description
				>{showDone
					? 'No items match this filter.'
					: 'New posts and materials will show up here as they land. Assignments live in To-do.'}</Empty.Description
			>
		</Empty.Header>
	</Empty.Root>
{:else}
	<div role="list" class="mt-4">
		<WindowVirtualizer bind:this={virtualizer} data={visible} getKey={(i) => i.key} ssrCount={12}>
			{#snippet children(item, index)}
				{@const isDone = dismissed.has(item.key)}
				<div
					role="listitem"
					class={`group -mx-3 flex gap-3 rounded-lg border-b border-border/60 px-3 py-4 ${isDone ? 'opacity-50' : ''} ${index === selected ? 'bg-accent/60' : ''}`}
				>
					<div class="min-w-0 flex-1">
						{#if item.kind === 'announcement'}
							<Announcement item={item.announcement} course={item.course} clamp />
						{:else}
							<div class="flex items-start gap-3 py-2">
								<BookOpenIcon class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
								<div class="min-w-0 flex-1">
									<div class="flex flex-wrap items-center gap-2">
										<a
											href={`/courses/${item.course.id}/material/${item.material.id}`}
											class="font-medium hover:underline">{item.material.title}</a
										>
										<Badge variant="secondary">Material</Badge>
									</div>
									<p
										class="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground"
									>
										<CourseDot id={item.course.id} />
										<a href={`/courses/${item.course.id}`} class="hover:text-foreground"
											>{displayName(item.course)}</a
										>
										<span aria-hidden="true">·</span>
										<span>posted {formatRelative(item.material.createdAt)}</span>
									</p>
									{#if item.material.materials.length}
										<div class="mt-3 max-w-md">
											<Attachments items={item.material.materials.slice(0, 3)} />
										</div>
									{/if}
								</div>
							</div>
						{/if}
					</div>
					<div class="shrink-0 pt-3">
						{#if isDone}
							<Button variant="ghost" size="sm" onclick={() => undo(item)}
								><UndoIcon data-icon="inline-start" />Undo</Button
							>
						{:else}
							<Button variant="outline" size="sm" onclick={() => done(item)} aria-label="Mark done"
								><CheckIcon data-icon="inline-start" />Done</Button
							>
						{/if}
					</div>
				</div>
			{/snippet}
		</WindowVirtualizer>
	</div>
	<p
		class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground max-sm:hidden"
	>
		<span><KbdGroup><Kbd>J</Kbd><Kbd>K</Kbd></KbdGroup> move</span>
		<span><Kbd>E</Kbd> done / undo</span>
		<span><Kbd>↵</Kbd> open</span>
	</p>
{/if}
