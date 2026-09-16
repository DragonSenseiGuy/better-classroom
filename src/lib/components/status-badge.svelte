<script lang="ts">
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { isDueSoon } from '#lib/format.ts';
	import { statusLabel, type WorkSummary } from '#lib/work.ts';

	let {
		work
	}: { work: Pick<WorkSummary, 'status' | 'late' | 'dueAt' | 'assignedGrade' | 'maxPoints'> } =
		$props();
	const effective = $derived(
		work.status === 'assigned' && work.dueAt !== undefined && work.dueAt < Date.now()
			? 'missing'
			: work.status
	);
</script>

{#if effective === 'graded' && work.assignedGrade !== undefined}
	<Badge variant="outline" class="tabular-nums">
		{work.assignedGrade}{#if work.maxPoints}<span class="text-muted-foreground"
				>/{work.maxPoints}</span
			>{/if}
	</Badge>
{:else if effective === 'missing'}
	<Badge variant="destructive">Missing</Badge>
{:else if effective === 'turnedIn' || effective === 'returned'}
	<Badge variant="outline" class="text-emerald-700 dark:text-emerald-400">
		{statusLabel[effective]}{#if work.late}<span class="text-muted-foreground">· late</span>{/if}
	</Badge>
{:else if isDueSoon(work.dueAt)}
	<Badge variant="outline" class="text-amber-700 dark:text-amber-400">Due soon</Badge>
{/if}
