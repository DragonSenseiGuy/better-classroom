import uFuzzy from '@leeoniya/ufuzzy';
import { normalize } from './normalize';
import type { SearchHit } from '#lib/shared/types.ts';

export type Haystacks = { titles: string[]; bodies: string[] };

const titleExact = new uFuzzy({ intraMode: 0, intraIns: 0, interIns: Infinity });
const titleLoose = new uFuzzy({
	intraMode: 1,
	intraIns: 1,
	intraSub: 1,
	intraTrn: 1,
	intraDel: 1,
	interIns: Infinity
});
const bodyExact = new uFuzzy({
	intraMode: 0,
	intraIns: 0,
	interIns: Infinity,
	interLft: 1,
	interRgt: 0
});

const OUT_OF_ORDER_TERMS = 3;
const INFO_THRESHOLD = 1000;

export function runSearch<T extends { updatedAt: number; dueAt?: number }>(
	docs: T[],
	hay: Haystacks,
	rawQuery: string,
	limit: number
): SearchHit<T>[] {
	const needle = normalize(rawQuery);
	if (!needle) {
		return docs
			.slice()
			.sort((a, b) => b.updatedAt - a.updatedAt)
			.slice(0, limit)
			.map((doc) => ({ doc, score: 0 }));
	}
	const seen = new Set<T>();
	const out: SearchHit<T>[] = [];
	const passes: [uFuzzy, string[], number][] = [
		[titleExact, hay.titles, 3],
		[titleLoose, hay.titles, 2],
		[bodyExact, hay.bodies, 1]
	];
	for (const [uf, strings, tier] of passes) {
		if (out.length >= limit) break;
		for (const hit of collect(uf, docs, strings, needle, limit - out.length, seen)) {
			out.push({ doc: hit.doc, score: tier * 1_000_000 + hit.score });
		}
	}
	return out;
}

function collect<T>(
	uf: uFuzzy,
	docs: T[],
	hay: string[],
	needle: string,
	limit: number,
	seen: Set<T>
): SearchHit<T>[] {
	const [idxs, info, order] = uf.search(hay, needle, OUT_OF_ORDER_TERMS, INFO_THRESHOLD);
	if (!idxs || idxs.length === 0) return [];
	const out: SearchHit<T>[] = [];
	if (!info || !order) {
		for (const i of idxs) {
			if (out.length >= limit) break;
			const doc = docs[i];
			if (seen.has(doc)) continue;
			seen.add(doc);
			out.push({ doc, score: 1 });
		}
		return out;
	}
	for (let k = 0; k < order.length && out.length < limit; k++) {
		const doc = docs[info.idx[order[k]]];
		if (seen.has(doc)) continue;
		seen.add(doc);
		out.push({ doc, score: order.length - k });
	}
	return out;
}
