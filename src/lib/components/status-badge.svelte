<script lang="ts">
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { statusLabel, isDueSoon } from '#lib/format.ts';
	import type { WorkStatus } from '#lib/shared/status.ts';

	let {
		status,
		late = false,
		dueAt,
		assignedGrade,
		maxPoints,
		showAssigned = false
	}: {
		status: WorkStatus;
		late?: boolean;
		dueAt?: number;
		assignedGrade?: number;
		maxPoints?: number;
		showAssigned?: boolean;
	} = $props();
	const effective = $derived(
		status === 'assigned' && dueAt !== undefined && dueAt < Date.now() ? 'missing' : status
	);
</script>

{#if effective === 'graded' && assignedGrade !== undefined}
	<Badge variant="outline" class="tabular-nums">
		{assignedGrade}{#if maxPoints}<span class="text-muted-foreground">/{maxPoints}</span>{/if}
	</Badge>
{:else if effective === 'missing'}
	<Badge variant="destructive">Missing</Badge>
{:else if effective === 'turnedIn' || effective === 'returned'}
	<Badge variant="outline" class="text-emerald-700 dark:text-emerald-400">
		{statusLabel[effective]}{#if late}<span class="text-muted-foreground">· late</span>{/if}
	</Badge>
{:else if isDueSoon(dueAt)}
	<Badge variant="outline" class="text-amber-700 dark:text-amber-400">Due soon</Badge>
{:else if showAssigned}
	<Badge variant="secondary">Assigned</Badge>
{/if}
