# Benchmark results

Apple Silicon laptop, Bun 1.4.2, SQLite via `bun:sqlite`, seed data (8 courses, 200 assignments, 32 materials, 64 announcements). Run on 2026-09-09.

## Server-side fuzzy search (`bun run bench`)

Synthetic corpus, 12 queries × 5 rounds, in-process. The production server keeps this haystack in memory and rebuilds it after each sync.

| docs   | median  | p95      | max      |
| ------ | ------- | -------- | -------- |
| 500    | 1.7 ms  | 12.1 ms  | 12.2 ms  |
| 2 000  | 2.1 ms  | 30.7 ms  | 31.2 ms  |
| 10 000 | 10.8 ms | 164.1 ms | 179.2 ms |

The exact pass answers most queries. The p95 is the single-error fuzzy pass on a deliberately dense corpus where nearly every document shares vocabulary. The HTTP endpoint (`/api/search`) answers a two-word typo query on the seed data in about 6 ms end to end.

Spelling variants return identical result lists: colour/color, organise/organize, centre/center, analyse/analyze, programme/program, grey/gray, catalogue/catalog, travelling/traveling.
Typos resolve: revison, photografh, pendulm, algbera.

## SSR latency (`bun bench/http.bench.ts`)

Production build (`adapter-node`) run with `bun build/index.js`, warm.

Sequential (one user), 50 requests per route:

| route                    | p50     | p95     | HTML     |
| ------------------------ | ------- | ------- | -------- |
| `/`                      | 23.8 ms | 40.7 ms | 341.8 kB |
| `/todo`                  | 16.2 ms | 51.3 ms | 228.6 kB |
| `/courses/c1`            | 12.4 ms | 31.6 ms | 318.9 kB |
| `/courses/c1/work/c1-w0` | 8.3 ms  | 20.4 ms | 225.1 kB |
| `/search?q=colour`       | 7.0 ms  | 11.3 ms | 220.2 kB |
| `/settings`              | 7.2 ms  | 8.9 ms  | 241.6 kB |

Concurrency 20, 200 requests per route: p50 145–543 ms. Each SSR request materialises the TanStack DB collections from SQLite and runs the page's live queries, so it is CPU-bound in one process. This is a single-user app, so the sequential numbers are the ones that matter.

Every full page load carries the whole dataset (about 200 kB of JSON) so that all later navigations are client-side and instant. Client-side navigations transfer nothing but the route's code chunk. `adapter-node` does not gzip dynamic responses; behind a reverse proxy the HTML compresses roughly 8:1.

## Live updates

Sync → SQLite diff → Server-Sent Event → TanStack DB collection → live query → DOM. Measured with the mock Apps Script (`bun scripts/mock-classroom.ts`): a new announcement appeared in an open dashboard tab within the same second the sync finished, with no reload and no refetch. Only changed rows cross the wire.

## Client bundle (`bun run build`)

| chunk                                                   | gzip   |
| ------------------------------------------------------- | ------ |
| root layout (TanStack DB, sidebar, ⌘K palette, hotkeys) | 49 kB  |
| shared TanStack DB core chunk                           | 72 kB  |
| To-do page (TanStack Table + virtua)                    | 21 kB  |
| all JS chunks combined                                  | 251 kB |
