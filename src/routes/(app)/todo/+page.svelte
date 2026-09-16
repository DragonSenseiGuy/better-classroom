<script lang="ts">
	import {
		createTable,
		FlexRender,
		tableFeatures,
		rowSortingFeature,
		createSortedRowModel,
		sortFn_alphanumeric,
		sortFn_basic,
		columnFilteringFeature,
		createFilteredRowModel,
		filterFn_equals,
		type SortingState,
		type ColumnDef
	} from '@tanstack/svelte-table';
	import { Virtualizer } from 'virtua/svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import PageHeader from '#lib/components/page-header.svelte';
	import BulkProgressDialog from '#lib/components/bulk-progress-dialog.svelte';
	import { runBatch, type Progress, type SubmissionAction } from '#lib/submissions.ts';
	import { notify } from '#lib/toast.ts';
	import { celebrate } from '#lib/celebrate.ts';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import { SvelteSet } from 'svelte/reactivity';
	import CheckCheckIcon from '@lucide/svelte/icons/check-check';
	import UndoIcon from '@lucide/svelte/icons/undo-2';
	import XIcon from '@lucide/svelte/icons/x';
	import StatusBadge from '#lib/components/status-badge.svelte';
	import WorkItem from '#lib/components/work-item.svelte';
	import { dueDayStart, formatDate, formatDue, formatTime, startOfDay } from '#lib/format.ts';
	import { displayName } from '#lib/course.ts';
	import { pluralize } from '#lib/text.ts';
	import CourseDot from '#lib/components/course-dot.svelte';
	import { useLiveQuery } from '@tanstack/svelte-db';
	import { workWithContext } from '#lib/db/queries.ts';
	import {
		summarize,
		statusRank,
		byDue,
		canReclaim,
		canTurnIn,
		isNew,
		isOpen,
		type WorkSummary
	} from '#lib/work.ts';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import InboxIcon from '@lucide/svelte/icons/inbox';
	import ListIcon from '@lucide/svelte/icons/list';
	import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';

	const live = useLiveQuery({ query: workWithContext });
	const all = $derived(
		live.data.map((r) => summarize(r.w, r.s ?? undefined, displayName(r.c))).sort(byDue)
	);

	type Filter = 'open' | 'missing' | 'done' | 'all';
	type View = 'list' | 'week';
	const FILTERS: Filter[] = ['open', 'missing', 'done', 'all'];
	const readFilter = (v: string | null): Filter =>
		FILTERS.includes(v as Filter) ? (v as Filter) : 'open';
	const readView = (v: string | null): View => (v === 'week' ? 'week' : 'list');

	let filter = $state<Filter>(readFilter(page.url.searchParams.get('filter')));
	let view = $state<View>(readView(page.url.searchParams.get('view')));
	let sorting = $state<SortingState>([{ id: 'dueAt', desc: false }]);

	function setParam(key: string, value: string | null, fallback: string) {
		const url = new URL(page.url.href);
		if (value === null || value === fallback) url.searchParams.delete(key);
		else url.searchParams.set(key, value);
		goto(url, { replace: true, shallow: true });
	}
	function setFilter(v: string) {
		filter = readFilter(v);
		setParam('filter', filter, 'open');
	}
	function setView(v: string) {
		view = readView(v);
		setParam('view', view, 'list');
	}

	const rows = $derived.by(() => {
		switch (filter) {
			case 'open':
				return all.filter(isOpen);
			case 'missing':
				return all.filter((w) => w.status === 'missing');
			case 'done':
				return all.filter(
					(w) => w.status === 'turnedIn' || w.status === 'returned' || w.status === 'graded'
				);
			default:
				return all;
		}
	});

	const features = tableFeatures({
		rowSortingFeature,
		sortedRowModel: createSortedRowModel(),
		sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic },
		columnFilteringFeature,
		filteredRowModel: createFilteredRowModel(),
		filterFns: { equals: filterFn_equals }
	});

	const columns: ColumnDef<typeof features, WorkSummary, any>[] = [
		{ id: 'title', accessorKey: 'title', header: 'Assignment', sortFn: 'alphanumeric' },
		{ id: 'courseName', accessorKey: 'courseName', header: 'Course', sortFn: 'alphanumeric' },
		{
			id: 'dueAt',
			accessorFn: (w) => w.dueAt ?? Number.MAX_SAFE_INTEGER,
			header: 'Due',
			sortFn: 'basic'
		},
		{ id: 'maxPoints', accessorFn: (w) => w.maxPoints ?? -1, header: 'Points', sortFn: 'basic' },
		{ id: 'status', accessorFn: (w) => statusRank(w.status), header: 'Status', sortFn: 'basic' }
	];

	const table = createTable({
		features,
		columns,
		get data() {
			return rows;
		},
		state: {
			get sorting() {
				return sorting;
			}
		},
		onSortingChange: (updater) => {
			sorting = typeof updater === 'function' ? updater(sorting) : updater;
		},
		getRowId: (w) => w.id
	});

	const sortedRows = $derived(table.getRowModel().rows);
	let scrollRef = $state<HTMLDivElement>();

	const selected = new SvelteSet<string>();
	let anchor = $state<string | null>(null);
	$effect(() => {
		const ids = new Set(sortedRows.map((r) => r.id));
		for (const id of selected) if (!ids.has(id)) selected.delete(id);
		if (anchor && !ids.has(anchor)) anchor = null;
	});
	const selectedRows = $derived(
		sortedRows.filter((r) => selected.has(r.id)).map((r) => r.original)
	);
	const allSelected = $derived(sortedRows.length > 0 && selected.size === sortedRows.length);
	const someSelected = $derived(selected.size > 0 && !allSelected);

	function toggleRow(index: number, shift: boolean) {
		const row = sortedRows[index];
		if (!row) return;
		const anchorIndex = anchor ? sortedRows.findIndex((r) => r.id === anchor) : -1;
		if (shift && anchorIndex >= 0) {
			const on = selected.has(anchor!);
			const [from, to] = anchorIndex < index ? [anchorIndex, index] : [index, anchorIndex];
			for (let i = from; i <= to; i++) {
				if (on) selected.add(sortedRows[i].id);
				else selected.delete(sortedRows[i].id);
			}
			return;
		}
		if (selected.has(row.id)) selected.delete(row.id);
		else selected.add(row.id);
		anchor = row.id;
	}
	function toggleAll() {
		if (allSelected) selected.clear();
		else for (const r of sortedRows) selected.add(r.id);
		anchor = null;
	}
	function clearSelection() {
		selected.clear();
		anchor = null;
	}
	createHotkey('Escape', () => clearSelection(), { ignoreInputs: true });

	const turnInable = $derived(selectedRows.filter(canTurnIn));
	const reclaimable = $derived(selectedRows.filter(canReclaim));

	let batchOpen = $state(false);
	let batchTitle = $state('');
	let batchItems = $state<Progress[]>([]);
	let batchBusy = $state(false);
	const MODAL_THRESHOLD = 3;

	async function bulk(action: SubmissionAction, items: WorkSummary[]) {
		if (!items.length || batchBusy) return;
		const verb = action === 'turnIn' ? 'Marking done' : 'Unsubmitting';
		batchBusy = true;
		const modal = items.length > MODAL_THRESHOLD;
		if (modal) {
			batchTitle = `${verb} ${pluralize(items.length, 'assignment')}`;
			batchItems = [];
			batchOpen = true;
		}
		try {
			const result = await runBatch(action, items, (p) => (batchItems = p));
			const failed = result.filter((p) => p.state === 'failed');
			const done = result.length - failed.length;
			clearSelection();
			if (action === 'turnIn' && done > 0) celebrate();
			if (!modal) {
				if (failed.length)
					notify('rose', `${failed.length} of ${result.length} failed`, {
						description: failed[0].error
					});
				else
					notify(
						action === 'turnIn' ? 'emerald' : 'sky',
						action === 'turnIn'
							? `Marked ${pluralize(done, 'assignment')} done`
							: `Unsubmitted ${pluralize(done, 'assignment')}`,
						{
							action: {
								label: 'Undo',
								onClick: () =>
									bulk(
										action === 'turnIn' ? 'reclaim' : 'turnIn',
										items.filter((w) => result.find((p) => p.id === w.id)?.state === 'done')
									)
							}
						}
					);
			}
		} finally {
			batchBusy = false;
		}
	}

	const DAY = 86_400_000;
	const now = Date.now();
	const today = startOfDay(now);
	const mondayOf = (t: number) => {
		const d = new Date(t);
		const shift = (d.getDay() + 6) % 7;
		return startOfDay(t - shift * DAY);
	};
	let weekOffset = $state(0);
	const weekStart = $derived(mondayOf(today + weekOffset * 7 * DAY));
	const weekEnd = $derived(weekStart + 7 * DAY);
	const days = $derived(Array.from({ length: 7 }, (_, i) => weekStart + i * DAY));
	const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short' });
	const numFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric' });
	const rangeFmt = { format: (t: number) => formatDate(t, { day: 'numeric', month: 'short' }) };
	const week = $derived.by(() => {
		const byDay = new Map<number, WorkSummary[]>();
		const overdue: WorkSummary[] = [];
		const undated: WorkSummary[] = [];
		for (const w of rows) {
			if (w.dueAt === undefined) {
				undated.push(w);
				continue;
			}
			const day = dueDayStart(w.dueAt, w.hasDueTime);
			if (day >= weekStart && day < weekEnd) byDay.set(day, [...(byDay.get(day) ?? []), w]);
			else if (w.status === 'missing' && day < weekStart) overdue.push(w);
		}
		return { byDay, overdue, undated };
	});
	const weekLabel = $derived(
		weekOffset === 0
			? 'This week'
			: weekOffset === 1
				? 'Next week'
				: weekOffset === -1
					? 'Last week'
					: `${rangeFmt.format(weekStart)} – ${rangeFmt.format(weekEnd - DAY)}`
	);
</script>

<PageHeader title="To-do" description="Every assignment across your courses, sorted by due date.">
	{#snippet actions()}
		<ToggleGroup.Root
			type="single"
			variant="outline"
			size="sm"
			value={filter}
			onValueChange={(v) => v && setFilter(v)}
		>
			<ToggleGroup.Item value="open">Open</ToggleGroup.Item>
			<ToggleGroup.Item value="missing">Missing</ToggleGroup.Item>
			<ToggleGroup.Item value="done">Done</ToggleGroup.Item>
			<ToggleGroup.Item value="all">All</ToggleGroup.Item>
		</ToggleGroup.Root>
		<ToggleGroup.Root
			type="single"
			variant="outline"
			size="sm"
			value={view}
			onValueChange={(v) => v && setView(v)}
			aria-label="View"
		>
			<ToggleGroup.Item value="list" aria-label="List"><ListIcon /></ToggleGroup.Item>
			<ToggleGroup.Item value="week" aria-label="Week"><CalendarDaysIcon /></ToggleGroup.Item>
		</ToggleGroup.Root>
	{/snippet}
</PageHeader>

{#if view === 'week'}
	<div class="mt-6 flex flex-wrap items-center justify-between gap-2">
		<h2 class="text-base font-semibold tracking-tight">{weekLabel}</h2>
		<div class="flex items-center gap-1">
			<Button variant="ghost" size="icon-sm" aria-label="Previous week" onclick={() => weekOffset--}
				><ChevronLeftIcon /></Button
			>
			<Button
				variant="outline"
				size="sm"
				disabled={weekOffset === 0}
				onclick={() => (weekOffset = 0)}>Today</Button
			>
			<Button variant="ghost" size="icon-sm" aria-label="Next week" onclick={() => weekOffset++}
				><ChevronRightIcon /></Button
			>
		</div>
	</div>
	{#if week.overdue.length}
		<section class="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
			<h3 class="text-sm font-medium text-destructive">Overdue from before this week</h3>
			<div class="mt-1 flex flex-col">
				{#each week.overdue as w (w.id)}<WorkItem work={w} />{/each}
			</div>
		</section>
	{/if}
	<div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-7 lg:gap-2">
		{#each days as day (day)}
			{@const items = week.byDay.get(day) ?? []}
			{@const isToday = day === today}
			{@const past = day < today}
			<section
				class={`min-w-0 rounded-lg border p-2 ${isToday ? 'border-foreground/30 bg-accent/40' : ''} ${past ? 'opacity-60' : ''}`}
			>
				<h3 class="flex items-baseline justify-between text-sm">
					<span class={isToday ? 'font-semibold' : 'font-medium text-muted-foreground'}
						>{dayFmt.format(day)}</span
					>
					<span class="text-xs text-muted-foreground tabular-nums">{numFmt.format(day)}</span>
				</h3>
				{#if items.length >= 3}
					<Badge variant="secondary" class="mt-1 text-[10px]">Heavy · {items.length} due</Badge>
				{/if}
				<ul role="list" class="mt-2 flex flex-col gap-1.5">
					{#each items as w (w.id)}
						<li>
							<a
								href={`/courses/${w.courseId}/work/${w.id}`}
								class="block rounded-md border bg-card px-2 py-1.5 text-xs hover:bg-accent"
							>
								<span class="flex items-center gap-1.5">
									<CourseDot id={w.courseId} class="shrink-0" />
									<span class="truncate text-muted-foreground">{w.courseName}</span>
								</span>
								<span class="mt-0.5 line-clamp-2 font-medium">{w.title}</span>
								<span class="mt-1 flex items-center gap-1">
									{#if w.hasDueTime && w.dueAt}<span class="text-muted-foreground tabular-nums"
											>{formatTime(w.dueAt)}</span
										>{/if}
									<StatusBadge
										status={w.status}
										late={w.late}
										dueAt={w.dueAt}
										assignedGrade={w.assignedGrade}
										maxPoints={w.maxPoints}
									/>
								</span>
							</a>
						</li>
					{:else}
						<li class="py-2 text-center text-xs text-muted-foreground">–</li>
					{/each}
				</ul>
			</section>
		{/each}
	</div>
	{#if week.undated.length}
		<section class="mt-6">
			<h3 class="text-sm font-medium text-muted-foreground">No due date</h3>
			<div class="mt-1 flex flex-col">
				{#each week.undated as w (w.id)}<WorkItem work={w} />{/each}
			</div>
		</section>
	{/if}
{:else if sortedRows.length === 0}
	<Empty.Root class="mt-6 border border-dashed">
		<Empty.Header>
			<Empty.Media variant="icon"><InboxIcon /></Empty.Media>
			<Empty.Title>Nothing here</Empty.Title>
			<Empty.Description>No assignments match this filter.</Empty.Description>
		</Empty.Header>
	</Empty.Root>
{:else}
	{#if selected.size}
		<div
			class="fixed bottom-6 left-1/2 z-20 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10 md:left-[calc(50%+var(--sidebar-width,0px)/2)]"
			role="toolbar"
			aria-label="Selection actions"
		>
			<span class="font-medium tabular-nums">{pluralize(selected.size, 'assignment')} selected</span
			>
			<span class="hidden text-muted-foreground sm:inline">·</span>
			<Button
				size="sm"
				disabled={!turnInable.length || batchBusy}
				onclick={() => bulk('turnIn', turnInable)}
			>
				<CheckCheckIcon data-icon="inline-start" />Mark {turnInable.length === selectedRows.length
					? 'as done'
					: `${turnInable.length} as done`}
			</Button>
			<Button
				size="sm"
				variant="outline"
				disabled={!reclaimable.length || batchBusy}
				onclick={() => bulk('reclaim', reclaimable)}
			>
				<UndoIcon data-icon="inline-start" />Unsubmit{reclaimable.length !== selectedRows.length
					? ` ${reclaimable.length}`
					: ''}
			</Button>
			<Button size="sm" variant="ghost" onclick={clearSelection} aria-label="Clear selection">
				<XIcon data-icon="inline-start" />Clear
			</Button>
		</div>
	{/if}
	<div
		bind:this={scrollRef}
		class="todo-grid -mx-4 mt-6 h-[calc(100dvh-13rem)] overflow-auto sm:-mx-6 lg:-mx-8"
	>
		<table class="w-full text-sm {selected.size ? 'pb-20' : ''}">
			<thead class="sticky top-0 z-10 bg-background">
				{#each table.getHeaderGroups() as group (group.id)}
					<tr class="border-b">
						<th class="py-2 pl-4 sm:pl-6 lg:pl-8">
							<Checkbox
								checked={allSelected}
								indeterminate={someSelected}
								aria-label={allSelected ? 'Deselect all' : 'Select all'}
								onclick={(e: MouseEvent) => {
									e.preventDefault();
									toggleAll();
								}}
								onkeydown={(e: KeyboardEvent) => {
									if (e.key !== ' ') return;
									e.preventDefault();
									toggleAll();
								}}
							/>
						</th>
						{#each group.headers as header (header.id)}
							<th
								class="px-2 py-2 text-left font-medium whitespace-nowrap text-muted-foreground last:pr-4 sm:last:pr-6 lg:last:pr-8"
							>
								<button
									type="button"
									class="inline-flex items-center gap-1 hover:text-foreground"
									onclick={header.column.getToggleSortingHandler()}
								>
									<FlexRender {header} />
									{#if header.column.getIsSorted() === 'asc'}<ArrowUpIcon
											class="size-3.5"
										/>{:else if header.column.getIsSorted() === 'desc'}<ArrowDownIcon
											class="size-3.5"
										/>{/if}
								</button>
							</th>
						{/each}
					</tr>
				{/each}
			</thead>
			<Virtualizer
				as="tbody"
				item="tr"
				data={sortedRows}
				getKey={(r) => r.id}
				{scrollRef}
				itemSize={44}
			>
				{#snippet children(row, index)}
					{@const w = row.original}
					<td class="py-2.5 pl-4 sm:pl-6 lg:pl-8">
						<Checkbox
							checked={selected.has(w.id)}
							aria-label={`Select ${w.title}`}
							onmousedown={(e: MouseEvent) => e.shiftKey && e.preventDefault()}
							onclick={(e: MouseEvent) => {
								e.preventDefault();
								toggleRow(index, e.shiftKey);
							}}
							onkeydown={(e: KeyboardEvent) => {
								if (e.key !== ' ') return;
								e.preventDefault();
								toggleRow(index, e.shiftKey);
							}}
						/>
					</td>
					<td class="px-2 py-2.5">
						<a
							href={`/courses/${w.courseId}/work/${w.id}`}
							class="line-clamp-1 font-medium hover:underline"
							>{w.title}{#if isNew(w, now)}<Badge
									variant="secondary"
									class="ml-2 align-middle text-[10px]">New</Badge
								>{/if}</a
						>
					</td>
					<td class="px-2 py-2.5">
						<a
							href={`/courses/${w.courseId}`}
							class="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
						>
							<CourseDot id={w.courseId} class="shrink-0" /><span class="truncate"
								>{w.courseName}</span
							>
						</a>
					</td>
					<td
						class="px-2 py-2.5 whitespace-nowrap tabular-nums {w.status === 'missing'
							? 'text-destructive'
							: 'text-muted-foreground'}">{formatDue(w.dueAt, w.hasDueTime)}</td
					>
					<td class="px-2 py-2.5 text-muted-foreground tabular-nums">{w.maxPoints ?? ''}</td>
					<td class="px-2 py-2.5 pr-4 sm:pr-6 lg:pr-8"
						><StatusBadge
							status={w.status}
							late={w.late}
							dueAt={w.dueAt}
							assignedGrade={w.assignedGrade}
							maxPoints={w.maxPoints}
						/></td
					>
				{/snippet}
			</Virtualizer>
		</table>
	</div>
{/if}

<BulkProgressDialog bind:open={batchOpen} title={batchTitle} items={batchItems} />

<style>
	.todo-grid table {
		--cols: max-content minmax(0, 5fr) minmax(0, 3fr) 11rem 4.5rem 7.5rem;
	}
	.todo-grid :global(tr) {
		display: grid;
		grid-template-columns: var(--cols);
		align-items: center;
		border-bottom: 1px solid color-mix(in oklch, var(--border), transparent 40%);
	}
	.todo-grid thead,
	.todo-grid :global(tbody) {
		display: block;
	}
	.todo-grid :global(tbody) {
		position: relative;
	}
	.todo-grid :global(td),
	.todo-grid th {
		display: block;
		min-width: 0;
	}
</style>
