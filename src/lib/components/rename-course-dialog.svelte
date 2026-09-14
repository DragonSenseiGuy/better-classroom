<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { setCoursePrefs } from '#lib/course-prefs.ts';
	import { courseColorName } from '#lib/course-colors.svelte.ts';
	import { COLOR_CLASS, COLOR_NAMES, hashedColor, type ColorName } from '#lib/shared/colors.ts';
	import CheckIcon from '@lucide/svelte/icons/check';

	type Course = { id: string; name: string; nickname?: string; color?: string };
	let { course = $bindable(null) }: { course?: Course | null } = $props();
	let value = $state('');
	let color = $state<ColorName>('emerald');
	let saving = $state(false);
	$effect(() => {
		if (course) {
			value = course.nickname ?? course.name;
			color = courseColorName(course.id);
		}
	});

	async function save(e: SubmitEvent) {
		e.preventDefault();
		if (!course) return;
		saving = true;
		try {
			const trimmed = value.trim();
			await setCoursePrefs(course.id, {
				nickname: trimmed && trimmed !== course.name ? trimmed : null,
				color: color === hashedColor(course.id) ? null : color
			});
			course = null;
		} finally {
			saving = false;
		}
	}
</script>

<Dialog.Root open={course !== null} onOpenChange={(open) => !open && (course = null)}>
	<Dialog.Content class="sm:max-w-sm">
		<Dialog.Header>
			<Dialog.Title>Edit course</Dialog.Title>
			<Dialog.Description
				>Only changes how it appears here. Classroom keeps “{course?.name}”.</Dialog.Description
			>
		</Dialog.Header>
		<form onsubmit={save} class="grid gap-4">
			<div class="grid gap-2">
				<Label for="course-nickname">Nickname</Label>
				<Input
					id="course-nickname"
					name="nickname"
					bind:value
					maxlength={80}
					autofocus
					class="max-sm:text-base/6"
				/>
			</div>
			<fieldset class="grid gap-2">
				<legend class="text-sm font-medium">Color</legend>
				<div class="flex flex-wrap gap-2">
					{#each COLOR_NAMES as name (name)}
						<button
							type="button"
							aria-label={name}
							aria-pressed={color === name}
							onclick={() => (color = name)}
							class={`flex size-7 items-center justify-center rounded-full text-white ring-offset-2 ring-offset-background transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${COLOR_CLASS[name]} ${color === name ? 'ring-2 ring-foreground/60' : ''}`}
						>
							{#if color === name}<CheckIcon class="size-4" />{/if}
						</button>
					{/each}
				</div>
			</fieldset>
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (course = null)}>Cancel</Button>
				<Button type="submit" disabled={saving}>Save</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
