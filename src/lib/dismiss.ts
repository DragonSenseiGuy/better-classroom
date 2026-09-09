export async function setDismissed(ids: string[], dismissed: boolean) {
	const res = await fetch('/api/dismiss', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ ids, dismissed })
	});
	if (!res.ok) throw new Error(await res.text());
}
