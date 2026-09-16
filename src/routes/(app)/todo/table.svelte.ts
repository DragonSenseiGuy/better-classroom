import {
	createTable,
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
import { statusRank, type WorkSummary } from '#lib/work.ts';

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

export function createTodoTable(rows: () => WorkSummary[]) {
	let sorting = $state<SortingState>([{ id: 'dueAt', desc: false }]);
	return createTable({
		features,
		columns,
		get data() {
			return rows();
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
}

export type TodoTable = ReturnType<typeof createTodoTable>;
