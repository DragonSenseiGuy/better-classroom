<script lang="ts">
	import { page } from '$app/state';
	import { useLiveQuery, eq } from '@tanstack/svelte-db';
	import { courses, courseWork, submissions, topics } from '#lib/db/collections.ts';
	import { summarize } from '#lib/work.ts';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Progress } from '#lib/components/ui/progress/index.js';
	import { Separator } from '#lib/components/ui/separator/index.js';
	import StatusBadge from '#lib/components/status-badge.svelte';
	import Attachments from '#lib/components/attachments.svelte';
	import {
		displayName,
		courseColor,
		formatDateLong,
		formatDateTime,
		formatDue,
		formatRelative,
		statusLabel
	} from '#lib/format.ts';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';

	const row = useLiveQuery({
		query: (q) =>
			q
				.from({ w: courseWork })
				.where(({ w }) => eq(w.id, page.params.workId))
				.innerJoin({ c: courses }, ({ w, c }) => eq(w.courseId, c.id))
				.leftJoin({ s: submissions }, ({ w, s }) => eq(w.id, s.courseWorkId))
				.findOne()
	});
	const topicQuery = useLiveQuery({
		query: (q) =>
			q
				.from({ t: topics })
				.where(({ t }) => eq(t.id, row.data?.w.topicId ?? ''))
				.findOne()
	});

	const w = $derived(
		row.data ? summarize(row.data.w, row.data.s ?? undefined, displayName(row.data.c)) : null
	);
	const sub = $derived(row.data?.s ?? null);
	const dueText = $derived(
		!w || w.dueAt === undefined
			? 'No due date'
			: w.hasDueTime
				? formatDateTime(w.dueAt)
				: formatDateLong(w.dueAt, true)
	);
	const facts = $derived(
		w
			? [
					{
						label: 'Due',
						value: dueText,
						hint: w.dueAt !== undefined ? formatDue(w.dueAt, w.hasDueTime) : undefined
					},
					{ label: 'Points', value: w.maxPoints ? String(w.maxPoints) : 'Ungraded' },
					{ label: 'Topic', value: topicQuery.data?.name ?? '–' },
					{ label: 'Posted', value: formatRelative(w.createdAt) }
				]
			: []
	);
</script>

{#if w}
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="min-w-0">
			<a
				href={`/courses/${w.courseId}`}
				class="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
			>
				<span class={`size-1.5 rounded-full ${courseColor(w.courseId)}`}></span>{w.courseName}
			</a>
			<h1 class="mt-1 text-2xl font-semibold tracking-tight text-balance">{w.title}</h1>
			<div class="mt-2 flex items-center gap-2">
				<StatusBadge
					status={w.status}
					late={w.late}
					dueAt={w.dueAt}
					assignedGrade={w.assignedGrade}
					maxPoints={w.maxPoints}
					showAssigned
				/>
			</div>
		</div>
		{#if w.alternateLink}
			<Button href={w.alternateLink} target="_blank" rel="noreferrer"
				>Open in Classroom <ExternalLinkIcon data-icon="inline-end" /></Button
			>
		{/if}
	</div>

	<dl class="mt-6 grid grid-cols-2 gap-y-4 sm:grid-cols-4">
		{#each facts as fact, i (fact.label)}
			<div
				class={`border-border/60 ${i % 2 === 1 ? 'border-l pl-4' : 'pr-4'} ${i >= 2 ? 'sm:border-l sm:pl-4' : ''} ${i === 2 ? 'max-sm:pl-0' : ''}`}
			>
				<dt class="truncate text-sm text-muted-foreground">{fact.label}</dt>
				<dd class="mt-0.5 text-sm font-medium tabular-nums">{fact.value}</dd>
				{#if fact.hint && fact.hint !== fact.value}<dd
						class="text-xs text-muted-foreground tabular-nums"
					>
						{fact.hint}
					</dd>{/if}
			</div>
		{/each}
	</dl>

	<div class="mt-8 grid gap-10 lg:grid-cols-[3fr_2fr]">
		<div>
			{#if w.description}
				<h2 class="text-base font-semibold tracking-tight">Instructions</h2>
				<p class="mt-2 max-w-[70ch] text-sm text-pretty whitespace-pre-wrap">{w.description}</p>
			{:else}
				<p class="text-sm text-muted-foreground">No instructions were given.</p>
			{/if}
			{#if w.materials.length}
				<h2 class="mt-8 text-base font-semibold tracking-tight">Attachments</h2>
				<div class="mt-2 max-w-lg"><Attachments items={w.materials} /></div>
			{/if}
		</div>
		<aside>
			<h2 class="text-base font-semibold tracking-tight">Your work</h2>
			{#if sub}
				<p class="mt-1 text-sm text-muted-foreground">
					{statusLabel[w.status]}{#if sub.late}
						· late{/if} · updated {formatRelative(sub.updatedAt)}
				</p>
				{#if w.assignedGrade !== undefined && w.maxPoints}
					<div class="mt-4">
						<div class="flex items-baseline justify-between text-sm">
							<span class="text-muted-foreground">Grade</span>
							<span class="font-medium tabular-nums"
								>{w.assignedGrade}<span class="text-muted-foreground">/{w.maxPoints}</span></span
							>
						</div>
						<Progress value={(w.assignedGrade / w.maxPoints) * 100} class="mt-2" />
					</div>
				{/if}
				{#if sub.attachments.length}
					<Separator class="my-4" />
					<Attachments items={sub.attachments} />
				{:else if w.status === 'assigned' || w.status === 'missing'}
					<p class="mt-3 text-sm text-muted-foreground">Nothing attached yet.</p>
				{/if}
				{#if sub.alternateLink}
					<Button
						variant="outline"
						size="sm"
						class="mt-4"
						href={sub.alternateLink}
						target="_blank"
						rel="noreferrer"
					>
						Manage submission <ExternalLinkIcon data-icon="inline-end" />
					</Button>
				{/if}
			{:else}
				<p class="mt-1 text-sm text-muted-foreground">No submission record yet.</p>
			{/if}
		</aside>
	</div>
{/if}
