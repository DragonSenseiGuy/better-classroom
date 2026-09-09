<script lang="ts">
	import * as Item from '#lib/components/ui/item/index.js';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import YoutubeIcon from '@lucide/svelte/icons/circle-play';
	import LinkIcon from '@lucide/svelte/icons/link';
	import ClipboardPenIcon from '@lucide/svelte/icons/clipboard-pen';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';

	type Attachment = { type: string; title?: string; url?: string; thumbnailUrl?: string };
	let { items }: { items: Attachment[] } = $props();

	const icons = {
		drive: FileTextIcon,
		youtube: YoutubeIcon,
		link: LinkIcon,
		form: ClipboardPenIcon
	} as const;
	const labels = { drive: 'Drive file', youtube: 'YouTube', link: 'Link', form: 'Form' } as const;
	const iconFor = (t: string) => icons[t as keyof typeof icons] ?? LinkIcon;
	const labelFor = (t: string) => labels[t as keyof typeof labels] ?? 'Attachment';
</script>

<Item.Group class="gap-1">
	{#each items as a, i (a.url ?? i)}
		{@const Icon = iconFor(a.type)}
		<Item.Root variant="outline" size="sm">
			{#snippet child({ props })}
				<a href={a.url} target="_blank" rel="noreferrer" {...props}>
					<Item.Media variant="icon"><Icon /></Item.Media>
					<Item.Content>
						<Item.Title class="line-clamp-1">{a.title || a.url}</Item.Title>
						<Item.Description>{labelFor(a.type)}</Item.Description>
					</Item.Content>
					<Item.Actions class="text-muted-foreground"
						><ExternalLinkIcon class="size-4" /></Item.Actions
					>
				</a>
			{/snippet}
		</Item.Root>
	{/each}
</Item.Group>
