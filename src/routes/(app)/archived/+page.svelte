<script lang="ts">
	import { useLiveQuery } from '@tanstack/svelte-db';
	import { courses } from '#lib/db/collections.ts';
	import { byCourseOrder, displayName, isArchived } from '#lib/course.ts';
	import { setCourseHidden } from '#lib/course-actions.ts';
	import { goto } from '$app/navigation';
	import CourseDot from '#lib/components/course-dot.svelte';
	import PageHeader from '#lib/components/page-header.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import ArchiveIcon from '@lucide/svelte/icons/archive';
	import EyeIcon from '@lucide/svelte/icons/eye';

	const archivedQuery = useLiveQuery({ query: (q) => q.from({ c: courses }) });
	const archived = $derived(archivedQuery.data.filter(isArchived).sort(byCourseOrder));

	// The course page owns fetching: it also handles direct URLs, refreshes
	// and sidebar clicks, so this list just navigates.
	const openCourse = (id: string) => goto(`/courses/${id}`);
</script>

<PageHeader
	title="Archived"
	description="Archived and hidden classes stay out of Home, To-do, Inbox and search. Only names are kept — content loads when you open one."
/>

{#if archived.length === 0}
	<Empty.Root class="mt-6 border border-dashed">
		<Empty.Header>
			<Empty.Media variant="icon"><ArchiveIcon /></Empty.Media>
			<Empty.Title>Nothing archived</Empty.Title>
			<Empty.Description>Hide a course from its menu and it will show up here.</Empty.Description>
		</Empty.Header>
	</Empty.Root>
{:else}
	<ul role="list" class="mt-6 max-w-2xl divide-y divide-border/60">
		{#each archived as course (course.id)}
			<li class="flex items-center gap-3 py-2.5">
				<CourseDot id={course.id} size="lg" class="shrink-0 opacity-70" />
				<button
					class="min-w-0 flex-1 truncate text-left text-sm font-medium hover:underline"
					onclick={() => openCourse(course.id)}
				>
					{displayName(course)}
				</button>
				{#if course.archived && !course.hidden}
					<Badge variant="secondary">Archived</Badge>
				{:else if course.hidden && !course.archived}
					<Badge variant="outline">Hidden</Badge>
				{:else}
					<Badge variant="secondary">Archived · Hidden</Badge>
				{/if}
				{#if course.hidden}
					<Button variant="outline" size="sm" onclick={() => setCourseHidden(course, false)}>
						<EyeIcon data-icon="inline-start" />Show
					</Button>
				{/if}
			</li>
		{/each}
	</ul>
{/if}
