export const load = async ({ url }) => ({
	title: 'Search',
	crumbs: [{ label: 'Search' }],
	q: url.searchParams.get('q') ?? ''
});
