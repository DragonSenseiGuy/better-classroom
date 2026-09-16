<script lang="ts">
	import { page } from '$app/state';
	import { useLiveQuery } from '@tanstack/svelte-db';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import { setSearchParam } from '#lib/navigation.ts';
	import { workWithContext } from '#lib/db/queries.ts';
	import { displayName } from '#lib/course.ts';
	import { pluralize } from '#lib/text.ts';
	import { notify } from '#lib/toast.ts';
	import { celebrate } from '#lib/celebrate.ts';
	import { createSelection } from '#lib/selection.svelte.ts';
	import { runBatch, type Progress, type SubmissionAction } from '#lib/submissions.ts';
	import { summarize, byDue, canReclaim, canTurnIn, isOpen, type WorkSummary } from '#lib/work.ts';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import PageHeader from '#lib/components/page-header.svelte';
	import BulkProgressDialog from '#lib/components/bulk-progress-dialog.svelte';
	import InboxIcon from '@lucide/svelte/icons/inbox';
	import ListIcon from '@lucide/svelte/icons/list';
	import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
	import { createTodoTable } from './table.svelte';
	import TodoTable from './todo-table.svelte';
	import SelectionToolbar from './selection-toolbar.svelte';
	import WeekGrid from './week-grid.svelte';

	const workQuery = useLiveQuery({ query: workWithContext });
	const all = $derived(
		workQuery.data.map((r) => summarize(r.w, r.s ?? undefined, displayName(r.c))).sort(byDue)
	);

	type Filter = 'open' | 'missing' | 'done' | 'all';
	type View = 'list' | 'week';
	const FILTERS: Filter[] = ['open', 'missing', 'done', 'all'];
	const readFilter = (v: string | null): Filter =>
		FILTERS.includes(v as Filter) ? (v as Filter) : 'open';
	const readView = (v: string | null): View => (v === 'week' ? 'week' : 'list');

	let filter = $state<Filter>(readFilter(page.url.searchParams.get('filter')));
	let view = $state<View>(readView(page.url.searchParams.get('view')));

	function setFilter(v: string) {
		filter = readFilter(v);
		setSearchParam('filter', filter, 'open');
	}
	function setView(v: string) {
		view = readView(v);
		setSearchParam('view', view, 'list');
	}

	const rows = $derived.by(() => {
		switch (filter) {
			case 'open':
				return all.filter(isOpen);
			case 'missing':
				return all.filter((w) => w.status === 'missing');
			case 'done':
				return all.filter((w) => !isOpen(w));
			default:
				return all;
		}
	});

	const table = createTodoTable(() => rows);
	const sortedRows = $derived(table.getRowModel().rows);
	const selection = createSelection(() => sortedRows.map((r) => r.id));
	const selectedRows = $derived(
		sortedRows.filter((r) => selection.has(r.id)).map((r) => r.original)
	);
	createHotkey('Escape', () => selection.clear(), { ignoreInputs: true });

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
			selection.clear();
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
	<WeekGrid {rows} />
{:else if sortedRows.length === 0}
	<Empty.Root class="mt-6 border border-dashed">
		<Empty.Header>
			<Empty.Media variant="icon"><InboxIcon /></Empty.Media>
			<Empty.Title>Nothing here</Empty.Title>
			<Empty.Description>No assignments match this filter.</Empty.Description>
		</Empty.Header>
	</Empty.Root>
{:else}
	{#if selection.size}
		<SelectionToolbar
			count={selection.size}
			turnInable={turnInable.length}
			reclaimable={reclaimable.length}
			busy={batchBusy}
			onTurnIn={() => bulk('turnIn', turnInable)}
			onReclaim={() => bulk('reclaim', reclaimable)}
			onClear={() => selection.clear()}
		/>
	{/if}
	<TodoTable {table} {selection} />
{/if}

<BulkProgressDialog bind:open={batchOpen} title={batchTitle} items={batchItems} />
