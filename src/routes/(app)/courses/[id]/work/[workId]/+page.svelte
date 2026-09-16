<script lang="ts">
	import { page } from '$app/state';
	import { useLiveQuery, eq } from '@tanstack/svelte-db';
	import { courses, courseWork, submissions } from '#lib/db/collections.ts';
	import { topicById } from '#lib/db/queries.ts';
	import {
		comments as commentsApi,
		errorMessage,
		submissionFiles,
		submitWork,
		type SubmissionAction
	} from '#lib/api.ts';
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
	import { celebrate } from '#lib/celebrate.ts';
	import type { Comment, SubmissionFile } from '#lib/shared/types.ts';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import PaperclipIcon from '@lucide/svelte/icons/paperclip';
	import XIcon from '@lucide/svelte/icons/x';

	let comments = $state<Comment[] | null>(null);
	let commentsError = $state<string | null>(null);
	let commentDraft = $state('');
	let posting = $state(false);
	let removing = $state<string | null>(null);

	async function loadComments() {
		if (!ref) return;
		commentsError = null;
		try {
			comments = await commentsApi.list(ref);
		} catch (err) {
			commentsError = errorMessage(err);
			comments = [];
		}
	}

	async function postComment() {
		if (!ref || !commentDraft.trim()) return;
		posting = true;
		try {
			await commentsApi.post(ref, commentDraft.trim());
			commentDraft = '';
			await loadComments();
		} catch (err) {
			notify('rose', 'Could not post comment', { description: errorMessage(err) });
		} finally {
			posting = false;
		}
	}

	async function removeComment(id: string) {
		if (!ref) return;
		removing = id;
		try {
			await commentsApi.remove(ref, id);
			comments = (comments ?? []).filter((c) => c.id !== id);
		} catch (err) {
			notify('rose', 'Could not delete comment', { description: errorMessage(err) });
		} finally {
			removing = null;
		}
	}

	$effect(() => {
		if (w && sub && comments === null) void loadComments();
	});

	let files = $state<SubmissionFile[] | null>(null);
	let filesError = $state<string | null>(null);
	let uploading = $state(false);
	let removingFile = $state<string | null>(null);

	async function loadFiles() {
		if (!ref) return;
		filesError = null;
		try {
			files = await submissionFiles.list(ref);
		} catch (err) {
			filesError = errorMessage(err);
			files = [];
		}
	}

	async function uploadFile(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!ref || !file) return;
		uploading = true;
		try {
			files = await submissionFiles.upload(ref, file);
			notify('emerald', 'File attached', { description: file.name });
		} catch (err) {
			notify('rose', 'Could not attach file', { description: errorMessage(err), duration: 10000 });
		} finally {
			uploading = false;
		}
	}

	async function removeFile(driveId: string) {
		if (!ref) return;
		removingFile = driveId;
		try {
			files = await submissionFiles.remove(ref, driveId);
		} catch (err) {
			notify('rose', 'Could not remove file', { description: errorMessage(err) });
		} finally {
			removingFile = null;
		}
	}

	$effect(() => {
		if (w && sub && files === null) void loadFiles();
	});

	let acting = $state<SubmissionAction | null>(null);
	async function submit(action: SubmissionAction) {
		if (!w || !ref || !sub) return;
		acting = action;
		try {
			await submitWork(action, { ...ref, submissionId: sub.id });
			notify('emerald', action === 'turnIn' ? 'Handed in' : 'Unsubmitted', {
				description: w.title
			});
			if (action === 'turnIn') celebrate();
		} catch (err) {
			notify('rose', action === 'turnIn' ? 'Could not hand in' : 'Could not unsubmit', {
				description: errorMessage(err),
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
	const topicQuery = useLiveQuery({ query: (q) => topicById(q, row.data?.w.topicId) });

	const w = $derived(
		row.data ? summarize(row.data.w, row.data.s ?? undefined, displayName(row.data.c)) : null
	);
	const sub = $derived(row.data?.s ?? null);
	const ref = $derived(w ? { courseId: w.courseId, workId: w.id } : null);
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
				<Separator class="my-4" />
				{#if filesError}
					{#if sub.attachments.length}
						<Attachments items={sub.attachments} />
					{:else}
						<p class="text-sm text-muted-foreground">Nothing attached yet.</p>
					{/if}
				{:else if files === null}
					<p class="text-sm text-muted-foreground">Loading files…</p>
				{:else}
					{#if files.length === 0}
						<p class="text-sm text-muted-foreground">Nothing attached yet.</p>
					{:else}
						<ul role="list" class="space-y-1.5 text-sm">
							{#each files as f (f.driveId)}
								<li class="group flex items-center gap-2 rounded-lg border px-3 py-2">
									<PaperclipIcon class="size-3.5 shrink-0 text-muted-foreground" />
									<a
										href={f.url ?? `https://drive.google.com/file/d/${f.driveId}/view`}
										target="_blank"
										rel="noreferrer"
										class="min-w-0 flex-1 truncate underline-offset-2 hover:underline"
										>{f.title ?? f.driveId}</a
									>
									{#if w.status === 'assigned' || w.status === 'missing'}
										<button
											type="button"
											class="rounded p-0.5 text-muted-foreground hover:text-destructive disabled:opacity-50"
											aria-label="Remove file"
											disabled={removingFile === f.driveId}
											onclick={() => removeFile(f.driveId)}
										>
											{#if removingFile === f.driveId}<LoaderIcon
													class="size-3.5 animate-spin"
												/>{:else}<XIcon class="size-3.5" />{/if}
										</button>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
					{#if w.status === 'assigned' || w.status === 'missing'}
						<label
							class="mt-2 inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground underline-offset-2 hover:underline"
						>
							{#if uploading}<LoaderIcon class="size-3.5 animate-spin" />{:else}<PaperclipIcon
									class="size-3.5"
								/>{/if}
							{uploading ? 'Uploading…' : 'Add file'}
							<input type="file" class="sr-only" disabled={uploading} onchange={uploadFile} />
						</label>
					{/if}
				{/if}
				<div class="mt-4 flex flex-wrap gap-2">
					{#if w.status === 'assigned' || w.status === 'missing'}
						<Button size="sm" onclick={() => submit('turnIn')} disabled={acting !== null}>
							{#if acting === 'turnIn'}<LoaderIcon
									data-icon="inline-start"
									class="animate-spin"
								/>{/if}
							{sub.attachments.length ? 'Hand in' : 'Mark as done'}
						</Button>
					{:else if w.status === 'turnedIn'}
						<Button
							variant="outline"
							size="sm"
							onclick={() => submit('reclaim')}
							disabled={acting !== null}
						>
							{#if acting === 'reclaim'}<LoaderIcon
									data-icon="inline-start"
									class="animate-spin"
								/>{/if}
							Unsubmit
						</Button>
					{/if}
					{#if sub.alternateLink}
						<Button
							variant="outline"
							size="sm"
							href={sub.alternateLink}
							target="_blank"
							rel="noreferrer"
						>
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
