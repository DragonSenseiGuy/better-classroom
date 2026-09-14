<script lang="ts">
	import * as Item from '#lib/components/ui/item/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import StatusBadge from '#lib/components/status-badge.svelte';
	import { courseColor, formatDue } from '#lib/format.ts';
	import { isNew, type WorkSummary } from '#lib/work.ts';
	import ClipboardListIcon from '@lucide/svelte/icons/clipboard-list';
	import MessageCircleQuestionIcon from '@lucide/svelte/icons/message-circle-question';

	let { work, showCourse = true }: { work: WorkSummary; showCourse?: boolean } = $props();
	const isQuestion = $derived(work.workType.endsWith('QUESTION'));
</script>

<Item.Root variant="default" size="sm" class="-mx-3">
	{#snippet child({ props })}
		<a href={`/courses/${work.courseId}/work/${work.id}`} {...props}>
			<Item.Media variant="icon" class="text-muted-foreground">
				{#if isQuestion}<MessageCircleQuestionIcon />{:else}<ClipboardListIcon />{/if}
			</Item.Media>
			<Item.Content>
				<Item.Title class="line-clamp-1">
					{work.title}{#if isNew(work)}<Badge
							variant="secondary"
							class="ml-2 align-middle text-[10px]">New</Badge
						>{/if}
				</Item.Title>
				<Item.Description class="flex items-center gap-1.5">
					{#if showCourse}
						<span class={`size-1.5 shrink-0 rounded-full ${courseColor(work.courseId)}`}></span>
						<span class="truncate">{work.courseName}</span>
						<span aria-hidden="true">·</span>
					{/if}
					<span class="shrink-0 tabular-nums">{formatDue(work.dueAt, work.hasDueTime)}</span>
					{#if work.maxPoints}
						<span aria-hidden="true">·</span>
						<span class="shrink-0 tabular-nums">{work.maxPoints} pts</span>
					{/if}
				</Item.Description>
			</Item.Content>
			<Item.Actions>
				<StatusBadge
					status={work.status}
					late={work.late}
					dueAt={work.dueAt}
					assignedGrade={work.assignedGrade}
					maxPoints={work.maxPoints}
				/>
			</Item.Actions>
		</a>
	{/snippet}
</Item.Root>
