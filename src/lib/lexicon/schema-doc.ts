/**
 * Single-sources the one SkyPress-owned lexicon for the public /lexicon page.
 *
 * The owned schema is imported from its canonical JSON (not retyped), so the page's
 * "the format we own" section cannot silently drift from the lexicon. The interop
 * `site.standard.*` tables on the page are hand-authored — those lexicons are
 * community-owned (Decision 0005).
 */
import schema from '../../../lexicons/blog.skypress.content.gutenberg.json';

interface LexiconObjectDef {
	type: string;
	description: string;
	required?: string[];
	properties: Record< string, { type: string; description: string } >;
}

interface LexiconDoc {
	lexicon: number;
	id: string;
	defs: { main: LexiconObjectDef };
}

const doc = schema as LexiconDoc;

/** A documented field of the owned content lexicon's `main` object. */
export interface SchemaField {
	name: string;
	type: string;
	required: boolean;
	description: string;
}

/** The owned lexicon's NSID, e.g. `blog.skypress.content.gutenberg`. */
export const CONTENT_LEXICON_ID = doc.id;

/** The `defs.main` description straight from the schema. */
export const CONTENT_LEXICON_DESCRIPTION = doc.defs.main.description;

/** The raw schema object, for rendering the actual JSON on the page. */
export const CONTENT_LEXICON = doc;

/** Ordered field rows for the owned lexicon's `main` object (insertion order). */
export function contentSchemaFields(): SchemaField[] {
	const main = doc.defs.main;
	const required = new Set( main.required ?? [] );
	return Object.entries( main.properties ).map( ( [ name, def ] ) => ( {
		name,
		type: def.type,
		required: required.has( name ),
		description: def.description,
	} ) );
}
