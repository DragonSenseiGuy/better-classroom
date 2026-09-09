<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { setCoursePrefs } from '#lib/course-prefs.ts';
	import { notify } from '#lib/toast.ts';

	type Course = { id: string; name: string; nickname?: string };
	let { course = $bindable(null) }: { course?: Course | null } = $props();
	let value = $state('');
	let saving = $state(false);
	$effect(() => {
		if (course) value = course.nickname ?? course.name;
	});

	async function save(e: SubmitEvent) {
		e.preventDefault();
		if (!course) return;
		saving = true;
		try {
			const trimmed = value.trim();
			await setCoursePrefs(course.id, {
				nickname: trimmed && trimmed !== course.name ? trimmed : null
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
			<Dialog.Title>Rename course</Dialog.Title>
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
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (course = null)}>Cancel</Button>
				<Button type="submit" disabled={saving}>Save</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
