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
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import PageHeader from '#lib/components/page-header.svelte';
	import StatusBadge from '#lib/components/status-badge.svelte';
	import { courseColor, displayName, formatDue, statusRank } from '#lib/format.ts';
	import { useLiveQuery } from '@tanstack/svelte-db';
	import { workWithContext } from '#lib/db/queries.ts';
	import { summarize, byDue, type WorkSummary } from '#lib/work.ts';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
	import InboxIcon from '@lucide/svelte/icons/inbox';

	const live = useLiveQuery({ query: workWithContext });
	const all = $derived(
		live.data.map((r) => summarize(r.w, r.s ?? undefined, displayName(r.c))).sort(byDue)
	);

	type Filter = 'open' | 'missing' | 'done' | 'all';
	let filter = $state<Filter>('open');
	let sorting = $state<SortingState>([{ id: 'dueAt', desc: false }]);

	const rows = $derived.by(() => {
		switch (filter) {
			case 'open':
				return all.filter((w) => w.status === 'assigned' || w.status === 'missing');
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
</script>

<PageHeader title="To-do" description="Every assignment across your courses, sorted by due date.">
	{#snippet actions()}
		<ToggleGroup.Root
			type="single"
			variant="outline"
			size="sm"
			bind:value={filter}
			onValueChange={(v) => !v && (filter = 'open')}
		>
			<ToggleGroup.Item value="open">Open</ToggleGroup.Item>
			<ToggleGroup.Item value="missing">Missing</ToggleGroup.Item>
			<ToggleGroup.Item value="done">Done</ToggleGroup.Item>
			<ToggleGroup.Item value="all">All</ToggleGroup.Item>
		</ToggleGroup.Root>
	{/snippet}
</PageHeader>

{#if sortedRows.length === 0}
	<Empty.Root class="mt-6 border border-dashed">
		<Empty.Header>
			<Empty.Media variant="icon"><InboxIcon /></Empty.Media>
			<Empty.Title>Nothing here</Empty.Title>
			<Empty.Description>No assignments match this filter.</Empty.Description>
		</Empty.Header>
	</Empty.Root>
{:else}
	<div
		bind:this={scrollRef}
		class="todo-grid -mx-4 mt-6 h-[calc(100dvh-13rem)] overflow-auto sm:-mx-6 lg:-mx-8"
	>
		<table class="w-full text-sm">
			<thead class="sticky top-0 z-10 bg-background">
				{#each table.getHeaderGroups() as group (group.id)}
					<tr class="border-b">
						{#each group.headers as header (header.id)}
							<th
								class="px-2 py-2 text-left font-medium whitespace-nowrap text-muted-foreground first:pl-4 last:pr-4 sm:first:pl-6 sm:last:pr-6 lg:first:pl-8 lg:last:pr-8"
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
				{#snippet children(row)}
					{@const w = row.original}
					<td class="px-2 py-2.5 pl-4 sm:pl-6 lg:pl-8">
						<a
							href={`/courses/${w.courseId}/work/${w.id}`}
							class="line-clamp-1 font-medium hover:underline">{w.title}</a
						>
					</td>
					<td class="px-2 py-2.5">
						<a
							href={`/courses/${w.courseId}`}
							class="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
						>
							<span class={`size-1.5 shrink-0 rounded-full ${courseColor(w.courseId)}`}></span><span
								class="truncate">{w.courseName}</span
							>
						</a>
					</td>
					<td
						class="px-2 py-2.5 whitespace-nowrap tabular-nums {w.status === 'missing'
							? 'text-destructive'
							: 'text-muted-foreground'}">{formatDue(w.dueAt, w.hasDueTime)}</td
					>
					<td class="px-2 py-2.5 text-muted-foreground tabular-nums">{w.maxPoints ?? '–'}</td>
					<td class="px-2 py-2.5 pr-4 sm:pr-6 lg:pr-8"
						><StatusBadge
							status={w.status}
							late={w.late}
							dueAt={w.dueAt}
							assignedGrade={w.assignedGrade}
							maxPoints={w.maxPoints}
							showAssigned
						/></td
					>
				{/snippet}
			</Virtualizer>
		</table>
	</div>
{/if}

<style>
	.todo-grid table {
		--cols: minmax(0, 5fr) minmax(0, 3fr) 11rem 4.5rem 7.5rem;
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
