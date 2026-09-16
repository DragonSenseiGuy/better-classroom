import { goto } from '$app/navigation';
import { page } from '$app/state';

export function setSearchParam(key: string, value: string | null, fallback?: string) {
	const url = new URL(page.url.href);
	if (value === null || value === fallback) url.searchParams.delete(key);
	else url.searchParams.set(key, value);
	return goto(url, { replace: true, shallow: true });
}
