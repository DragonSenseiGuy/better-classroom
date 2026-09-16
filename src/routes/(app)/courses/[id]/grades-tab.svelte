<script lang="ts">
	import { gradePercent, type WorkSummary } from '#lib/work.ts';
	import { formatDue } from '#lib/format.ts';
	import { pluralize } from '#lib/text.ts';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import PercentIcon from '@lucide/svelte/icons/percent';

	let { work, courseId }: { work: WorkSummary[]; courseId: string } = $props();

	const graded = $derived(
		work
			.filter((w) => w.assignedGrade !== undefined)
			.sort((a, b) => (b.dueAt ?? b.updatedAt) - (a.dueAt ?? a.updatedAt))
	);
	const totals = $derived.by(() => {
		const scored = graded.filter((w) => w.maxPoints);
		const earned = scored.reduce((n, w) => n + (w.assignedGrade ?? 0), 0);
		const possible = scored.reduce((n, w) => n + (w.maxPoints ?? 0), 0);
		return { earned, possible, percent: possible ? Math.round((earned / possible) * 100) : null };
	});
</script>

{#if graded.length === 0}
	<Empty.Root class="border border-dashed">
		<Empty.Header>
			<Empty.Media variant="icon"><PercentIcon /></Empty.Media>
			<Empty.Title>Nothing graded yet</Empty.Title>
			<Empty.Description>Returned work with a grade will be listed here.</Empty.Description>
		</Empty.Header>
	</Empty.Root>
{:else}
	<div class="flex flex-wrap items-baseline justify-between gap-2">
		<h2 class="text-base font-semibold tracking-tight">
			{pluralize(graded.length, 'graded assignment')}
		</h2>
		{#if totals.percent !== null}
			<p class="text-sm text-muted-foreground tabular-nums">
				Overall <span class="font-medium text-foreground">{totals.percent}%</span>
				· {totals.earned}/{totals.possible} points
			</p>
		{/if}
	</div>
	<ul role="list" class="mt-2 divide-y divide-border/60">
		{#each graded as w (w.id)}
			{@const pct = gradePercent(w)}
			<li>
				<a
					href={`/courses/${courseId}/work/${w.id}`}
					class="-mx-3 flex items-center gap-4 rounded-lg px-3 py-3 hover:bg-accent/60"
				>
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-medium">{w.title}</p>
						<p class="text-xs text-muted-foreground tabular-nums">
							{w.dueAt !== undefined ? formatDue(w.dueAt, w.hasDueTime) : 'No due date'}{#if w.late}
								· late{/if}
						</p>
					</div>
					<div class="w-24 shrink-0 text-right text-sm tabular-nums">
						<span class="font-medium">{w.assignedGrade}</span>{#if w.maxPoints}<span
								class="text-muted-foreground">/{w.maxPoints}</span
							>{/if}
					</div>
					{#if pct !== null}
						<div class="w-16 shrink-0 text-right text-sm text-muted-foreground tabular-nums">
							{Math.round(pct)}%
						</div>
					{/if}
				</a>
			</li>
		{/each}
	</ul>
{/if}
