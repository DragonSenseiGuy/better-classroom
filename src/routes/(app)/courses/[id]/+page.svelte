<script lang="ts">
	import { page } from '$app/state';
	import { setSearchParam } from '#lib/navigation.ts';
	import { groupBy } from '#lib/group.ts';
	import { useLiveQuery, eq } from '@tanstack/svelte-db';
	import { announcements, courses, materials, topics } from '#lib/db/collections.ts';
	import { workInCourse } from '#lib/db/queries.ts';
	import { isOpen, summarize } from '#lib/work.ts';
	import * as Tabs from '#lib/components/ui/tabs/index.js';
	import * as Item from '#lib/components/ui/item/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import WorkItem from '#lib/components/work-item.svelte';
	import Announcement from '#lib/components/announcement.svelte';
	import { formatRelative } from '#lib/format.ts';
	import { courseLabel, displayName, isArchived } from '#lib/course.ts';
	import { pluralize } from '#lib/text.ts';
	import CourseDot from '#lib/components/course-dot.svelte';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import InboxIcon from '@lucide/svelte/icons/inbox';
	import PersonList from './person-list.svelte';
	import GradesTab from './grades-tab.svelte';
	import { syncSingleCourse } from '#lib/api.ts';
	import { setCourseHidden } from '#lib/course-actions.ts';
	import EyeIcon from '@lucide/svelte/icons/eye';
	import LoaderIcon from '@lucide/svelte/icons/loader-circle';

	const courseQuery = useLiveQuery({
		query: (q) =>
			q
				.from({ c: courses })
				.where(({ c }) => eq(c.id, page.params.id))
				.findOne()
	});
	const workQuery = useLiveQuery({ query: (q) => workInCourse(q, page.params.id) });
	const materialQuery = useLiveQuery({
		query: (q) => q.from({ m: materials }).where(({ m }) => eq(m.courseId, page.params.id))
	});
	const topicQuery = useLiveQuery({
		query: (q) =>
			q
				.from({ t: topics })
				.where(({ t }) => eq(t.courseId, page.params.id))
				.orderBy(({ t }) => t.name, 'asc')
	});
	const streamQuery = useLiveQuery({
		query: (q) =>
			q
				.from({ a: announcements })
				.where(({ a }) => eq(a.courseId, page.params.id))
				.orderBy(({ a }) => a.updatedAt, 'desc')
	});

	const course = $derived(courseQuery.data);
	const description = $derived(courseLabel(course?.description));
	const isArchivedView = $derived(!!course && isArchived(course));
	// Keyed by course id so a slow fetch for one course can't block or
	// clobber another when navigating quickly between archived courses.
	let loadingFor = $state<string | null>(null);
	let errorFor = $state<{ id: string; message: string } | null>(null);
	// One attempt per course id: an empty result still counts, so genuinely
	// empty courses don't loop. Retry resets the key below.
	let fetchedFor = $state<string | null>(null);
	const loadingArchived = $derived(course ? loadingFor === course.id : false);
	const archivedError = $derived(
		course && errorFor?.id === course.id ? errorFor.message : null
	);

	async function ensureArchivedContent(id: string) {
		if (fetchedFor === id || loadingFor === id) return;
		fetchedFor = id;
		loadingFor = id;
		if (errorFor?.id === id) errorFor = null;
		try {
			await syncSingleCourse(id);
		} catch (err: unknown) {
			errorFor = { id, message: err instanceof Error ? err.message : String(err) };
		} finally {
			if (loadingFor === id) loadingFor = null;
		}
	}

	function retryArchived() {
		const c = course;
		if (!c) return;
		fetchedFor = null;
		void ensureArchivedContent(c.id);
	}

	$effect(() => {
		const c = course;
		// Fetch-on-open: archived/hidden keep names only until opened.
		// Active courses sync in the background; unhidden ones refetch on
		// unhide via updateCoursePrefs, so only archived views fetch here.
		if (!c || !isArchived(c)) return;
		if (workQuery.data.length > 0 || materialQuery.data.length > 0 || streamQuery.data.length > 0)
			fetchedFor = c.id;
		else void ensureArchivedContent(c.id);
	});
	const work = $derived(
		course ? workQuery.data.map((r) => summarize(r.w, r.s ?? undefined, displayName(course))) : []
	);

	let tab = $state(page.url.searchParams.get('tab') ?? 'classwork');
	function setTab(value: string) {
		tab = value;
		setSearchParam('tab', value, 'classwork');
	}

	type Entry =
		| { kind: 'work'; rank: number; at: number; item: (typeof work)[number] }
		| { kind: 'material'; rank: number; at: number; item: (typeof materialQuery.data)[number] };
	const byRank = (a: Entry, b: Entry) =>
		a.rank - b.rank || (a.rank === 0 ? a.at - b.at : b.at - a.at);
	const sections = $derived.by(() => {
		const entries: Entry[] = [
			...work.map((w) =>
				isOpen(w)
					? { kind: 'work' as const, rank: 0, at: w.dueAt ?? Infinity, item: w }
					: { kind: 'work' as const, rank: 1, at: w.dueAt ?? w.updatedAt, item: w }
			),
			...materialQuery.data.map((m) => ({
				kind: 'material' as const,
				rank: 1,
				at: m.updatedAt,
				item: m
			}))
		];
		const byTopic = groupBy(entries, (e) => e.item.topicId);
		const list = [
			...topicQuery.data.map((t) => ({ id: t.id as string | undefined, name: t.name })),
			{ id: undefined, name: 'No topic' }
		];
		return list
			.map((t) => ({ ...t, entries: (byTopic.get(t.id) ?? []).sort(byRank) }))
			.filter((t) => t.entries.length);
	});
	const openCount = $derived(work.filter(isOpen).length);

	$effect(() => {
		const hash = page.url.hash;
		if (!hash || streamQuery.data.length === 0) return;
		const el = document.getElementById(hash.slice(1));
		el?.scrollIntoView({ block: 'center' });
	});
</script>

{#if course}
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="min-w-0">
			<div class="flex items-center gap-2">
				<CourseDot id={course.id} size="lg" />
				<h1 class="text-2xl font-semibold tracking-tight text-balance">{displayName(course)}</h1>
			</div>
			<p class="mt-1 text-sm text-muted-foreground">
				{[course.nickname ? course.name : undefined, courseLabel(course.section), course.room]
					.filter(Boolean)
					.join(' · ')}{#if openCount}
					· {pluralize(openCount, 'open assignment')}{/if}
			</p>
		</div>
		{#if course.alternateLink}
			<Button
				variant="outline"
				size="sm"
				href={course.alternateLink}
				target="_blank"
				rel="noreferrer"
			>
				Open in Classroom <ExternalLinkIcon data-icon="inline-end" />
			</Button>
		{/if}
	</div>
	{#if isArchivedView}
		<div class="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
			{#if loadingArchived}
				<LoaderIcon class="size-4 animate-spin" />
				<span>Loading archived content…</span>
			{:else if archivedError}
				<span>Couldn't load this archived course: {archivedError}</span>
				<Button variant="outline" size="sm" onclick={retryArchived}>Retry</Button>
			{:else}
				<span>This course is archived — content was loaded on demand.</span>
			{/if}
			{#if course.hidden}
				<Button variant="outline" size="sm" onclick={() => setCourseHidden(course, false)}>
					<EyeIcon data-icon="inline-start" />Show course
				</Button>
			{/if}
		</div>
	{/if}

	<Tabs.Root value={tab} onValueChange={setTab} class="mt-6">
		<Tabs.List variant="line">
			<Tabs.Trigger value="classwork">Classwork</Tabs.Trigger>
			<Tabs.Trigger value="stream">Stream</Tabs.Trigger>
			<Tabs.Trigger value="people">People</Tabs.Trigger>
			<Tabs.Trigger value="grades">Grades</Tabs.Trigger>
		</Tabs.List>
		<Tabs.Content value="classwork" class="mt-4">
			{#if sections.length === 0}
				<Empty.Root class="border border-dashed">
					<Empty.Header>
						<Empty.Media variant="icon"><InboxIcon /></Empty.Media>
						<Empty.Title>No classwork yet</Empty.Title>
						<Empty.Description
							>Assignments and materials will appear here after the next sync.</Empty.Description
						>
					</Empty.Header>
				</Empty.Root>
			{:else}
				<div class="divide-y divide-border/60">
					{#each sections as section (section.id ?? 'none')}
						<section class="py-5">
							<h2 class="text-base font-semibold tracking-tight">{section.name}</h2>
							<div class="mt-1 flex flex-col">
								{#each section.entries as entry (entry.kind + entry.item.id)}
									{#if entry.kind === 'work'}
										<WorkItem work={entry.item} showCourse={false} />
									{:else}
										<Item.Root size="sm" class="-mx-3">
											{#snippet child({ props })}
												<a href={`/courses/${course.id}/material/${entry.item.id}`} {...props}>
													<Item.Media variant="icon" class="text-muted-foreground"
														><BookOpenIcon /></Item.Media
													>
													<Item.Content>
														<Item.Title class="line-clamp-1">{entry.item.title}</Item.Title>
														<Item.Description
															>Material · {pluralize(entry.item.materials.length, 'attachment')} · {formatRelative(
																entry.item.updatedAt
															)}</Item.Description
														>
													</Item.Content>
												</a>
											{/snippet}
										</Item.Root>
									{/if}
								{/each}
							</div>
						</section>
					{/each}
				</div>
			{/if}
		</Tabs.Content>
		<Tabs.Content value="stream" class="mt-2 divide-y divide-border/60">
			{#each streamQuery.data as item (item.id)}
				<Announcement {item} {course} showCourse={false} />
			{:else}
				<p class="py-6 text-sm text-muted-foreground">No announcements in this course.</p>
			{/each}
		</Tabs.Content>
		<Tabs.Content value="people" class="mt-4">
			<h2 class="text-base font-semibold tracking-tight">Teachers</h2>
			<PersonList people={course.teachers} variant="teacher" />
			{#if course.students?.length}
				<h2 class="mt-8 text-base font-semibold tracking-tight">
					Classmates <span class="font-normal text-muted-foreground tabular-nums"
						>· {course.studentCount ?? course.students.length}</span
					>
				</h2>
				<PersonList people={course.students} variant="student" />
			{/if}
			{#if description}
				<h2 class="mt-8 text-base font-semibold tracking-tight">
					{course.descriptionHeading || 'About'}
				</h2>
				<p class="mt-2 text-sm text-pretty whitespace-pre-wrap text-muted-foreground">
					{description}
				</p>
			{/if}
		</Tabs.Content>
		<Tabs.Content value="grades" class="mt-4">
			<GradesTab {work} courseId={course.id} />
		</Tabs.Content>
	</Tabs.Root>
{/if}
