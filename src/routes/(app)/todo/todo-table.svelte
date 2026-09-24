<script lang="ts">
	import { FlexRender } from '@tanstack/svelte-table';
	import { Virtualizer } from 'virtua/svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import StatusBadge from '#lib/components/status-badge.svelte';
	import CourseDot from '#lib/components/course-dot.svelte';
	import { formatDue } from '#lib/format.ts';
	import { isNew } from '#lib/work.ts';
	import { pluralize } from '#lib/text.ts';
	import type { Selection } from '#lib/selection.svelte.ts';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
	import type { TodoTable } from './table.svelte';

	let { table, selection }: { table: TodoTable; selection: Selection } = $props();

	const now = Date.now();
	const sortedRows = $derived(table.getRowModel().rows);
	const sortId = $derived(table.atoms.sorting.get()[0]?.id ?? 'dueAt');
	let scrollRef = $state<HTMLDivElement>();

	const sortOptions = [
		{ id: 'dueAt', label: 'Due date' },
		{ id: 'title', label: 'Assignment' },
		{ id: 'courseName', label: 'Course' },
		{ id: 'maxPoints', label: 'Points' },
		{ id: 'status', label: 'Status' }
	];
</script>

{#snippet selectRow(id: string, title: string, index: number, className = '')}
	<Checkbox
		checked={selection.has(id)}
		aria-label={`Select ${title}`}
		class={className}
		onmousedown={(e: MouseEvent) => e.shiftKey && e.preventDefault()}
		onclick={(e: MouseEvent) => {
			e.preventDefault();
			selection.toggle(index, e.shiftKey);
		}}
		onkeydown={(e: KeyboardEvent) => {
			if (e.key !== ' ') return;
			e.preventDefault();
			selection.toggle(index, e.shiftKey);
		}}
	/>
{/snippet}

<!-- Cards for narrow screens: the grid table below needs ~480px and would
force sideways scrolling on phones. -->
<div class="mt-4 sm:hidden">
	<div class="flex items-center justify-between gap-2">
		<p class="text-xs text-muted-foreground tabular-nums">
			{pluralize(sortedRows.length, 'assignment')}
		</p>
		<label class="flex items-center gap-1.5 text-xs text-muted-foreground">
			Sort by
			<select
				value={sortId}
				onchange={(e) => table.setSorting([{ id: e.currentTarget.value, desc: false }])}
				class="rounded-md border border-input bg-background px-1.5 py-1 text-xs text-foreground"
			>
				{#each sortOptions as option (option.id)}
					<option value={option.id}>{option.label}</option>
				{/each}
			</select>
		</label>
	</div>
	<ul class="mt-2 flex flex-col gap-2 {selection.size ? 'pb-24' : ''}">
		{#each sortedRows as row, index (row.id)}
			{@const w = row.original}
			<li class="flex gap-2.5 rounded-lg border bg-card px-3 py-2.5">
				{@render selectRow(w.id, w.title, index, 'mt-0.5')}
				<div class="min-w-0 flex-1">
					<a
						href={`/courses/${w.courseId}/work/${w.id}`}
						class="line-clamp-2 text-sm font-medium hover:underline"
						>{w.title}{#if isNew(w, now)}<Badge
								variant="secondary"
								class="ml-2 align-middle text-[10px]">New</Badge
							>{/if}</a
					>
					<p class="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
						<CourseDot id={w.courseId} class="shrink-0" /><span class="truncate"
							>{w.courseName}</span
						>
					</p>
					<p
						class="mt-0.5 text-xs tabular-nums {w.status === 'missing'
							? 'text-destructive'
							: 'text-muted-foreground'}"
					>
						{formatDue(w.dueAt, w.hasDueTime)}{#if w.maxPoints}
							· {w.maxPoints} pts{/if}
					</p>
				</div>
				<div class="shrink-0"><StatusBadge work={w} /></div>
			</li>
		{/each}
	</ul>
</div>

<div
	bind:this={scrollRef}
	class="todo-grid -mx-4 mt-6 hidden h-[calc(100dvh-13rem)] overflow-auto sm:-mx-6 sm:block lg:-mx-8"
>
	<table class="w-full text-sm {selection.size ? 'pb-20' : ''}">
		<thead class="sticky top-0 z-10 bg-background">
			{#each table.getHeaderGroups() as group (group.id)}
				<tr class="border-b">
					<th class="py-2 pl-4 sm:pl-6 lg:pl-8">
						<Checkbox
							checked={selection.all}
							indeterminate={selection.some}
							aria-label={selection.all ? 'Deselect all' : 'Select all'}
							onclick={(e: MouseEvent) => {
								e.preventDefault();
								selection.toggleAll();
							}}
							onkeydown={(e: KeyboardEvent) => {
								if (e.key !== ' ') return;
								e.preventDefault();
								selection.toggleAll();
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
					{@render selectRow(w.id, w.title, index)}
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
				<td class="px-2 py-2.5 pr-4 sm:pr-6 lg:pr-8"><StatusBadge work={w} /></td>
			{/snippet}
		</Virtualizer>
	</table>
</div>

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
