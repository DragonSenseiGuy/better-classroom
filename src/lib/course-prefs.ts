export async function setCoursePrefs(
	id: string,
	patch: { nickname?: string | null; color?: string | null; hidden?: boolean }
) {
	const res = await fetch(`/api/courses/${id}/prefs`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(patch)
	});
	if (!res.ok) throw new Error(await res.text());
}
