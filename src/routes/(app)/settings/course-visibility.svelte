<script lang="ts">
	import { useLiveQuery } from '@tanstack/svelte-db';
	import { courses } from '#lib/db/collections.ts';
	import { byCourseOrder, displayName, isArchived, isVisible } from '#lib/course.ts';
	import { moveByDelta } from '#lib/course-order.ts';
	import { editCourse } from '#lib/course-editor.svelte.ts';
	import { setCourseHidden } from '#lib/course-actions.ts';
	import { errorMessage, setCourseOrder } from '#lib/api.ts';
	import { notify } from '#lib/toast.ts';
	import CourseDot from '#lib/components/course-dot.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import EyeIcon from '@lucide/svelte/icons/eye';
	import EyeOffIcon from '@lucide/svelte/icons/eye-off';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';

	const courseQuery = useLiveQuery({ query: (q) => q.from({ c: courses }) });
	const sorted = $derived(courseQuery.data.slice().sort(byCourseOrder));
	const visible = $derived(sorted.filter(isVisible));
	const hidden = $derived(sorted.filter(isArchived));

	async function move(id: string, delta: number) {
		const ids = visible.map((c) => c.id);
		const next = moveByDelta(ids, id, delta);
		if (next === ids) return;
		try {
			await setCourseOrder(next);
		} catch (err) {
			notify('rose', 'Couldn’t save course order', { description: errorMessage(err) });
		}
	}
</script>

<p class="max-w-[65ch] text-sm text-pretty text-muted-foreground">
	Nicknames and colors only change how courses look here. Drag courses in the sidebar — or use the
	arrows — to reorder them. Hidden courses move to
	<a href="/archived" class="underline underline-offset-4">Archived</a>, leave the sidebar, To-do,
	Home and search, and stop syncing content until you reopen them.
</p>
<ul role="list" class="mt-4 max-w-lg divide-y divide-border/60">
	{#each visible as course, index (course.id)}
		<li class="flex items-center gap-1 py-2">
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label="Move {displayName(course)} up"
				disabled={index === 0}
				onclick={() => move(course.id, -1)}><ArrowUpIcon /></Button
			>
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label="Move {displayName(course)} down"
				disabled={index === visible.length - 1}
				onclick={() => move(course.id, 1)}><ArrowDownIcon /></Button
			>
			<CourseDot id={course.id} size="lg" class="shrink-0" />
			<span class="min-w-0 flex-1 truncate text-sm"
				>{displayName(course)}{#if course.nickname}<span class="text-muted-foreground">
						· {course.name}</span
					>{/if}</span
			>
			<Button variant="ghost" size="icon-sm" aria-label="Edit" onclick={() => editCourse(course)}
				><PencilIcon /></Button
			>
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label="Hide"
				onclick={() => setCourseHidden(course, true)}><EyeOffIcon /></Button
			>
		</li>
	{:else}
		<li class="py-3 text-sm text-muted-foreground">No courses synced yet.</li>
	{/each}
</ul>
{#if hidden.length}
	<h2 class="mt-8 text-base font-semibold tracking-tight">Archived</h2>
	<ul role="list" class="mt-2 max-w-lg divide-y divide-border/60">
		{#each hidden as course (course.id)}
			<li class="flex items-center gap-3 py-2 opacity-70">
				<CourseDot id={course.id} size="lg" class="shrink-0" />
				<span class="min-w-0 flex-1 truncate text-sm">{displayName(course)}</span>
				{#if course.hidden}
					<Button variant="outline" size="sm" onclick={() => setCourseHidden(course, false)}
						><EyeIcon data-icon="inline-start" />Show</Button
					>
				{/if}
			</li>
		{/each}
	</ul>
{/if}
