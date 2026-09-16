export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

type Scalar = 'string' | 'int' | 'bool' | 'json';

export type FieldSpec = {
	name: string;
	type: Scalar | Message<unknown>;
	repeated?: boolean;
	doc?: string;
};

export type Message<T> = {
	name: string;
	tag?: string;
	fields: Record<number, FieldSpec>;
	__type?: T;
};

export const f = (name: string, type: FieldSpec['type'] = 'json', doc?: string): FieldSpec => ({
	name,
	type,
	doc
});
export const rep = (name: string, type: FieldSpec['type'], doc?: string): FieldSpec => ({
	name,
	type,
	repeated: true,
	doc
});

export function message<T>(
	name: string,
	fields: Record<number, FieldSpec>,
	tag?: string
): Message<T> {
	return { name, fields, tag };
}

function decodeValue(value: Json, spec: FieldSpec): unknown {
	if (value === null || value === undefined) return undefined;
	if (spec.repeated) {
		if (!Array.isArray(value)) return undefined;
		return value.map((v) => decodeOne(v, spec.type)).filter((v) => v !== undefined);
	}
	return decodeOne(value, spec.type);
}

function decodeOne(value: Json, type: FieldSpec['type']): unknown {
	if (value === null || value === undefined) return undefined;
	switch (type) {
		case 'string':
			return typeof value === 'string' ? value : String(value);
		case 'int':
			return typeof value === 'number' ? value : Number(value);
		case 'bool':
			return Boolean(value);
		case 'json':
			return value;
		default:
			return decode(value, type);
	}
}

export function decode<T>(value: Json, msg: Message<T>): T | undefined {
	if (!Array.isArray(value)) return undefined;
	const out: Record<string, unknown> = {};
	for (const [num, spec] of Object.entries(msg.fields)) {
		const decoded = decodeValue(value[Number(num) - 1] ?? null, spec);
		if (decoded !== undefined) out[spec.name] = decoded;
	}
	return out as T;
}
