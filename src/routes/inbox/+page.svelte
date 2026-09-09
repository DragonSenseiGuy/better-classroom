<script lang="ts">
	import { useLiveQuery } from '@tanstack/svelte-db';
	import { WindowVirtualizer } from 'virtua/svelte';
	import {
		allDismissals,
		inboxAnnouncements,
		inboxKey,
		inboxMaterials,
		inboxWork
	} from '#lib/inbox.ts';
	import { summarize, type WorkSummary } from '#lib/work.ts';
	import { setDismissed } from '#lib/dismiss.ts';
	import { celebrate } from '#lib/celebrate.ts';
	import { notify } from '#lib/toast.ts';
	import PageHeader from '#lib/components/page-header.svelte';
	import Announcement from '#lib/components/announcement.svelte';
	import StatusBadge from '#lib/components/status-badge.svelte';
	import Attachments from '#lib/components/attachments.svelte';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { courseColor, displayName, formatDue, formatRelative, pluralize } from '#lib/format.ts';
	import type { Announcement as AnnouncementRow, Course, Material } from '#lib/shared/types.ts';
	import CheckIcon from '@lucide/svelte/icons/check';
	import UndoIcon from '@lucide/svelte/icons/undo-2';
	import PartyPopperIcon from '@lucide/svelte/icons/party-popper';
	import ClipboardListIcon from '@lucide/svelte/icons/clipboard-list';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import CheckCheckIcon from '@lucide/svelte/icons/check-check';

	const announcementQuery = useLiveQuery({ query: inboxAnnouncements });
	const workQuery = useLiveQuery({ query: inboxWork });
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
		| { key: string; kind: 'work'; at: number; course: Course; work: WorkSummary }
		| { key: string; kind: 'material'; at: number; course: Course; material: Material };

	type Filter = 'all' | 'announcements' | 'classwork';
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
		for (const r of workQuery.data)
			out.push({
				key: inboxKey('work', r.w.id),
				kind: 'work',
				at: r.w.createdAt,
				course: r.c,
				work: summarize(r.w, r.s ?? undefined, displayName(r.c))
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
					: i.kind !== 'announcement'
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

	async function done(item: Item) {
		await setDismissed([item.key], true);
		notify('emerald', 'Ticked off', {
			description:
				item.kind === 'announcement'
					? item.announcement.text.slice(0, 60)
					: item.kind === 'work'
						? item.work.title
						: item.material.title,
			action: { label: 'Undo', onClick: () => setDismissed([item.key], false) }
		});
	}

	async function restore(item: Item) {
		await setDismissed([item.key], false);
	}

	const WEEK = 7 * 86_400_000;
	const stale = $derived(pending.filter((i) => i.at < Date.now() - WEEK));

	async function doneOld() {
		const keys = stale.map((i) => i.key);
		if (!keys.length) return;
		await setDismissed(keys, true);
		notify('violet', `Ticked off ${pluralize(keys.length, 'item')} older than a week`, {
			action: { label: 'Undo', onClick: () => setDismissed(keys, false) }
		});
	}

	async function doneAll() {
		const keys = visible.filter((i) => !dismissed.has(i.key)).map((i) => i.key);
		if (!keys.length) return;
		await setDismissed(keys, true);
		notify('violet', `Ticked off ${pluralize(keys.length, 'item')}`, {
			action: { label: 'Undo', onClick: () => setDismissed(keys, false) }
		});
	}
</script>

<PageHeader
	title="Inbox"
	description={pending.length
		? `${pluralize(pending.length, 'thing')} to look at across your courses.`
		: 'Everything across your courses, ticked off.'}
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
			<ToggleGroup.Item value="classwork">Classwork</ToggleGroup.Item>
		</ToggleGroup.Root>
		<Button variant="outline" size="sm" onclick={() => (showDone = !showDone)}
			>{showDone ? 'Hide done' : 'Show done'}</Button
		>
		{#if visible.some((i) => !dismissed.has(i.key))}
			<Button size="sm" onclick={doneAll}
				><CheckCheckIcon data-icon="inline-start" />Tick off all</Button
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
					: 'New posts and classwork will show up here as they land.'}</Empty.Description
			>
		</Empty.Header>
	</Empty.Root>
{:else}
	<div role="list" class="mt-4">
		<WindowVirtualizer data={visible} getKey={(i) => i.key} ssrCount={12}>
			{#snippet children(item)}
				{@const isDone = dismissed.has(item.key)}
				<div
					role="listitem"
					class={`group flex gap-3 border-b border-border/60 py-4 ${isDone ? 'opacity-50' : ''}`}
				>
					<div class="min-w-0 flex-1">
						{#if item.kind === 'announcement'}
							<Announcement item={item.announcement} course={item.course} clamp />
						{:else if item.kind === 'work'}
							<div class="flex items-start gap-3 py-2">
								<ClipboardListIcon class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
								<div class="min-w-0 flex-1">
									<div class="flex flex-wrap items-center gap-2">
										<a
											href={`/courses/${item.course.id}/work/${item.work.id}`}
											class="font-medium hover:underline">{item.work.title}</a
										>
										<StatusBadge
											status={item.work.status}
											late={item.work.late}
											dueAt={item.work.dueAt}
											assignedGrade={item.work.assignedGrade}
											maxPoints={item.work.maxPoints}
										/>
									</div>
									<p
										class="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground"
									>
										<span class={`size-1.5 rounded-full ${courseColor(item.course.id)}`}></span>
										<a href={`/courses/${item.course.id}`} class="hover:text-foreground"
											>{displayName(item.course)}</a
										>
										<span aria-hidden="true">·</span>
										<span class="tabular-nums"
											>Due {formatDue(item.work.dueAt, item.work.hasDueTime)}</span
										>
										{#if item.work.maxPoints}<span aria-hidden="true">·</span><span
												class="tabular-nums">{item.work.maxPoints} pts</span
											>{/if}
										<span aria-hidden="true">·</span>
										<span>posted {formatRelative(item.work.createdAt)}</span>
									</p>
									{#if item.work.description}
										<p
											class="mt-2 line-clamp-3 max-w-[70ch] text-sm text-pretty whitespace-pre-wrap"
										>
											{item.work.description}
										</p>
									{/if}
								</div>
							</div>
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
										<span class={`size-1.5 rounded-full ${courseColor(item.course.id)}`}></span>
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
							<Button variant="ghost" size="sm" onclick={() => restore(item)}
								><UndoIcon data-icon="inline-start" />Restore</Button
							>
						{:else}
							<Button variant="outline" size="sm" onclick={() => done(item)} aria-label="Tick off"
								><CheckIcon data-icon="inline-start" />Done</Button
							>
						{/if}
					</div>
				</div>
			{/snippet}
		</WindowVirtualizer>
	</div>
{/if}
