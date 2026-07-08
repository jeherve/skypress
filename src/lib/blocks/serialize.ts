/**
 * The @wordpress block oracle — registration + serialize/parse.
 *
 * Importing this pulls the full `@wordpress/block-library` + `@wordpress/block-editor`
 * graph, which only runs under a DOM (browser or the Vitest/jsdom env) — it CANNOT
 * render in pure Node/edge (Decision 0003). So this module is used by:
 *   - the editor island (browser), and
 *   - tests, as the fidelity oracle for the dependency-free `render.ts`.
 * It must NOT be imported by reading pages. The light reader path lives in `render.ts`.
 */
import {
	serialize,
	parse,
	getBlockTypes,
	unregisterBlockType,
	type BlockInstance,
} from '@wordpress/blocks';
import { addFilter } from '@wordpress/hooks';
import { registerCoreBlocks } from '@wordpress/block-library';
import { ALLOWED_BLOCKS } from './allowlist';

let registered = false;

/** Block names kept for parsing even when not user-insertable. */
const FALLBACK_BLOCKS = [ 'core/missing', 'core/freeform' ];

/**
 * Teach `core/image` about `skypressBlob` — the typed atproto blob ref the publish
 * flow attaches to uploaded images (`attachBlobRefs`). It is NOT a core attribute, so
 * without this `createBlock`/`parse` sanitise it away when a published document is
 * reloaded for editing. Losing it drops the document's only reference to the image
 * blob, and the PDS garbage-collects that blob on the next update commit → the image
 * 404s (`Blob not found`). Registering the attribute makes it survive the edit
 * round-trip. Default-unset, so it never appears on images that don't have one — the
 * dependency-free `render.ts` and its fidelity test are unaffected.
 */
function addImageBlobRefAttribute( ...args: unknown[] ): unknown {
	const settings = args[ 0 ] as { attributes?: Record< string, unknown > };
	const name = args[ 1 ] as string;
	if ( name !== 'core/image' ) {
		return settings;
	}
	return {
		...settings,
		attributes: {
			...settings.attributes,
			skypressBlob: { type: 'object' },
		},
	};
}

/**
 * Register exactly the curated block set (idempotent). Registers core blocks,
 * then trims everything outside the allowlist so the serializer's surface
 * matches the editor's content model.
 */
export function registerSkyPressBlocks(): void {
	if ( registered ) {
		return;
	}
	// Must be added before `registerCoreBlocks()` so the filter runs as `core/image`
	// registers.
	addFilter(
		'blocks.registerBlockType',
		'skypress/image-blob-ref',
		addImageBlobRefAttribute
	);
	registerCoreBlocks();

	const keep = new Set< string >( [ ...ALLOWED_BLOCKS, ...FALLBACK_BLOCKS ] );
	for ( const blockType of getBlockTypes() ) {
		if ( ! keep.has( blockType.name ) ) {
			unregisterBlockType( blockType.name );
		}
	}
	registered = true;
}

/** Serialize a block tree to Gutenberg block markup. */
export function serializeBlocks( blocks: BlockInstance[] ): string {
	return serialize( blocks );
}

/** Parse Gutenberg block markup back into a block tree. */
export function parseBlocks( markup: string ): BlockInstance[] {
	return parse( markup );
}
