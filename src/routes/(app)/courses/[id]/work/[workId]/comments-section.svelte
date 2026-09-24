<script lang="ts">
	import { errorMessage, type CommentClient } from '#lib/api.ts';
	import type { WorkSummary } from '#lib/work.ts';
	import { notify } from '#lib/toast.ts';
	import { formatRelative } from '#lib/format.ts';
	import { Button } from '#lib/components/ui/button/index.js';
	import RichText from '#lib/components/rich-text.svelte';
	import type { Comment } from '#lib/shared/types.ts';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import LoaderIcon from '@lucide/svelte/icons/loader-circle';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';

	let {
		title,
		work,
		client,
		placeholder,
		fallback
	}: {
		title: string;
		work: WorkSummary;
		client: CommentClient;
		placeholder: string;
		fallback?: { label: string; href: string };
	} = $props();

	const ref = $derived({ courseId: work.courseId, workId: work.id });

	let comments = $state<Comment[] | null>(null);
	let commentsError = $state<string | null>(null);
	let commentDraft = $state('');
	let posting = $state(false);
	let removing = $state<string | null>(null);

	async function loadComments() {
		commentsError = null;
		try {
			comments = await client.list(ref);
		} catch (err) {
			commentsError = errorMessage(err);
			comments = [];
		}
	}

	async function postComment() {
		if (!commentDraft.trim()) return;
		posting = true;
		try {
			await client.post(ref, commentDraft.trim());
			commentDraft = '';
			await loadComments();
		} catch (err) {
			notify('rose', 'Could not post comment', { description: errorMessage(err) });
		} finally {
			posting = false;
		}
	}

	async function removeComment(id: string) {
		removing = id;
		try {
			await client.remove(ref, id);
			comments = (comments ?? []).filter((c) => c.id !== id);
		} catch (err) {
			notify('rose', 'Could not delete comment', { description: errorMessage(err) });
		} finally {
			removing = null;
		}
	}

	$effect(() => {
		if (comments === null) void loadComments();
	});
</script>

<h2 class="text-base font-semibold tracking-tight">{title}</h2>
{#if commentsError}
	<p class="mt-2 text-sm text-muted-foreground">{commentsError}</p>
	{#if fallback}
		<Button
			variant="outline"
			size="sm"
			class="mt-2"
			href={fallback.href}
			target="_blank"
			rel="noreferrer"
		>
			{fallback.label} <ExternalLinkIcon data-icon="inline-end" />
		</Button>
	{/if}
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
			placeholder={placeholder}
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
