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
	import RichText from '#lib/components/rich-text.svelte';
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
	import LoaderIcon from '@lucide/svelte/icons/loader-circle';
	import { notify } from '#lib/toast.ts';
	import type { Comment } from '#lib/shared/types.ts';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';

	let comments = $state<Comment[] | null>(null);
	let commentsError = $state<string | null>(null);
	let commentDraft = $state('');
	let posting = $state(false);
	let removing = $state<string | null>(null);

	const commentParams = () =>
		w ? new URLSearchParams({ courseId: w.courseId, workId: w.id }).toString() : '';

	async function loadComments() {
		if (!w) return;
		commentsError = null;
		const res = await fetch(`/api/comments?${commentParams()}`);
		if (!res.ok) {
			commentsError = (await res.text()).replace(/^.*"message":"([^"]*)".*$/s, '$1');
			comments = [];
			return;
		}
		comments = ((await res.json()) as { comments: Comment[] }).comments;
	}

	async function postComment() {
		if (!w || !commentDraft.trim()) return;
		posting = true;
		try {
			const res = await fetch('/api/comments', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ courseId: w.courseId, workId: w.id, text: commentDraft.trim() })
			});
			if (!res.ok) throw new Error((await res.text()).replace(/^.*"message":"([^"]*)".*$/s, '$1'));
			commentDraft = '';
			await loadComments();
		} catch (err) {
			notify('rose', 'Could not post comment', {
				description: err instanceof Error ? err.message : String(err)
			});
		} finally {
			posting = false;
		}
	}

	async function removeComment(id: string) {
		if (!w) return;
		removing = id;
		try {
			const res = await fetch('/api/comments', {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ courseId: w.courseId, workId: w.id, commentId: id })
			});
			if (!res.ok) throw new Error((await res.text()).replace(/^.*"message":"([^"]*)".*$/s, '$1'));
			comments = (comments ?? []).filter((c) => c.id !== id);
		} catch (err) {
			notify('rose', 'Could not delete comment', {
				description: err instanceof Error ? err.message : String(err)
			});
		} finally {
			removing = null;
		}
	}

	$effect(() => {
		if (w && sub && comments === null) void loadComments();
	});

	let acting = $state<'turnIn' | 'reclaim' | null>(null);
	async function submit(action: 'turnIn' | 'reclaim') {
		if (!w || !sub) return;
		acting = action;
		try {
			const res = await fetch('/api/submissions', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action, courseId: w.courseId, workId: w.id, submissionId: sub.id })
			});
			if (!res.ok) {
				const text = await res.text();
				throw new Error(text.replace(/^.*"message":"([^"]*)".*$/s, '$1'));
			}
			notify('emerald', action === 'turnIn' ? 'Handed in' : 'Unsubmitted', { description: w.title });
		} catch (err) {
			notify('rose', action === 'turnIn' ? 'Could not hand in' : 'Could not unsubmit', {
				description: err instanceof Error ? err.message : String(err),
				duration: 10000
			});
		} finally {
			acting = null;
		}
	}

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
				<RichText
					text={w.description}
					html={w.html}
					class="mt-2 max-w-[70ch] text-sm text-pretty break-words"
				/>
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
				<div class="mt-4 flex flex-wrap gap-2">
					{#if w.status === 'assigned' || w.status === 'missing'}
						<Button size="sm" onclick={() => submit('turnIn')} disabled={acting !== null}>
							{#if acting === 'turnIn'}<LoaderIcon data-icon="inline-start" class="animate-spin" />{/if}
							{sub.attachments.length ? 'Hand in' : 'Mark as done'}
						</Button>
					{:else if w.status === 'turnedIn'}
						<Button variant="outline" size="sm" onclick={() => submit('reclaim')} disabled={acting !== null}>
							{#if acting === 'reclaim'}<LoaderIcon data-icon="inline-start" class="animate-spin" />{/if}
							Unsubmit
						</Button>
					{/if}
					{#if sub.alternateLink}
						<Button variant="outline" size="sm" href={sub.alternateLink} target="_blank" rel="noreferrer">
							Manage submission <ExternalLinkIcon data-icon="inline-end" />
						</Button>
					{/if}
				</div>
				<Separator class="my-6" />
				<h2 class="text-base font-semibold tracking-tight">Private comments</h2>
				{#if commentsError}
					<p class="mt-2 text-sm text-muted-foreground">{commentsError}</p>
				{:else if comments === null}
					<p class="mt-2 text-sm text-muted-foreground">Loading…</p>
				{:else if comments.length === 0}
					<p class="mt-2 text-sm text-muted-foreground">No comments yet.</p>
				{:else}
					<ul role="list" class="mt-3 space-y-3">
						{#each comments as c (c.id)}
							<li class="group text-sm">
								<div class="flex items-baseline justify-between gap-2">
									<span class="font-medium">{c.mine ? 'You' : (c.author?.name ?? 'Teacher')}</span>
									<span class="flex items-center gap-2 text-xs text-muted-foreground">
										{#if c.createdAt}{formatRelative(c.createdAt)}{/if}
										{#if c.mine}
											<button
												type="button"
												class="rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
												aria-label="Delete comment"
												disabled={removing === c.id}
												onclick={() => removeComment(c.id)}
											>
												<Trash2Icon class="size-3.5" />
											</button>
										{/if}
									</span>
								</div>
								<RichText text={c.text} html={c.html} class="mt-0.5 text-pretty break-words" />
							</li>
						{/each}
					</ul>
				{/if}
				{#if !commentsError}
					<form
						class="mt-3 flex flex-col gap-2"
						onsubmit={(e) => {
							e.preventDefault();
							void postComment();
						}}
					>
						<textarea
							bind:value={commentDraft}
							rows="2"
							placeholder="Add a private comment for your teacher…"
							class="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
						></textarea>
						<div class="flex justify-end">
							<Button type="submit" size="sm" disabled={posting || !commentDraft.trim()}>
								{#if posting}<LoaderIcon data-icon="inline-start" class="animate-spin" />{/if}
								Post
							</Button>
						</div>
					</form>
				{/if}
			{:else}
				<p class="mt-1 text-sm text-muted-foreground">No submission record yet.</p>
			{/if}
		</aside>
	</div>
{/if}
