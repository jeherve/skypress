/**
 * The curated SkyPress block set — the content model (Decision 0002).
 *
 * Used two ways:
 *  - the editor restricts insertion to these via `iso.blocks.allowBlocks`;
 *  - the render/serialize path registers only these (plus fallbacks).
 *
 * `core/list-item` is included because `core/list` nests it; it is structural
 * rather than independently insertable.
 */
export const ALLOWED_BLOCKS = [
	'core/paragraph',
	'core/heading',
	'core/image',
	'core/gallery',
	'core/quote',
	'core/pullquote',
	'core/list',
	'core/list-item',
	'core/code',
	'core/separator',
	'core/embed',
] as const;

export type AllowedBlock = ( typeof ALLOWED_BLOCKS )[ number ];
