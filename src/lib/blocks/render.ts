/**
 * The light reader renderer (Decision 0003) — block tree → HTML and → plain text.
 *
 * DEPENDENCY-FREE BY DESIGN: this module imports nothing from `@wordpress/*`, so
 * it runs anywhere (pure Node build, Cloudflare/Vercel edge, the browser) and
 * keeps reading pages free of the editor's weight (brief §6). Its output fidelity
 * is locked to `@wordpress/blocks.serialize()` by `render.test.ts`, which uses the
 * real packages as the oracle.
 *
 * Covers the curated allowlist (Decision 0002). Image/gallery/pullquote/embed
 * rendering is stubbed pending SP3 (blobs) / SP4 (oEmbed + sanitisation).
 */

export interface BlockNode {
	name: string;
	attributes?: Record< string, unknown >;
	innerBlocks?: BlockNode[];
}

function attr( node: BlockNode, key: string ): string {
	const value = node.attributes?.[ key ];
	return value === undefined || value === null ? '' : String( value );
}

function renderBlock( node: BlockNode ): string {
	const inner = () => renderBlocks( node.innerBlocks ?? [] );

	switch ( node.name ) {
		case 'core/paragraph':
			return `<p>${ attr( node, 'content' ) }</p>`;

		case 'core/heading': {
			const level = Number( node.attributes?.level ?? 2 );
			return `<h${ level } class="wp-block-heading">${ attr( node, 'content' ) }</h${ level }>`;
		}

		case 'core/list': {
			const tag = node.attributes?.ordered ? 'ol' : 'ul';
			return `<${ tag } class="wp-block-list">${ inner() }</${ tag }>`;
		}

		case 'core/list-item':
			return `<li>${ attr( node, 'content' ) }</li>`;

		case 'core/quote': {
			const citation = attr( node, 'citation' );
			const cite = citation ? `<cite>${ citation }</cite>` : '';
			return `<blockquote class="wp-block-quote">${ inner() }${ cite }</blockquote>`;
		}

		case 'core/pullquote': {
			const citation = attr( node, 'citation' );
			const cite = citation ? `<cite>${ citation }</cite>` : '';
			return `<figure class="wp-block-pullquote"><blockquote><p>${ attr( node, 'value' ) }</p>${ cite }</blockquote></figure>`;
		}

		case 'core/code':
			return `<pre class="wp-block-code"><code>${ attr( node, 'content' ) }</code></pre>`;

		case 'core/separator':
			return '<hr class="wp-block-separator has-alpha-channel-opacity"/>';

		case 'core/image': {
			const url = attr( node, 'url' );
			const alt = attr( node, 'alt' );
			if ( ! url ) {
				return '';
			}
			const caption = attr( node, 'caption' );
			const fig = caption ? `<figcaption>${ caption }</figcaption>` : '';
			return `<figure class="wp-block-image"><img src="${ url }" alt="${ alt }"/>${ fig }</figure>`;
		}

		default:
			// Unknown / not-yet-supported block: degrade gracefully to its text.
			return attr( node, 'content' ) ? `<p>${ attr( node, 'content' ) }</p>` : '';
	}
}

/** Render a block tree to frontend HTML (no block-delimiter comments). */
export function renderBlocks( blocks: BlockNode[] ): string {
	return blocks.map( renderBlock ).join( '\n' );
}

const TEXT_ATTRIBUTES = [ 'content', 'value', 'citation', 'caption' ];

function decodeEntities( input: string ): string {
	return input
		.replace( /&lt;/g, '<' )
		.replace( /&gt;/g, '>' )
		.replace( /&quot;/g, '"' )
		.replace( /&#0?39;/g, "'" )
		.replace( /&apos;/g, "'" )
		.replace( /&nbsp;/g, ' ' )
		.replace( /&amp;/g, '&' );
}

function stripMarkup( value: string ): string {
	return decodeEntities(
		value.replace( /<!--[\s\S]*?-->/g, '' ).replace( /<[^>]*>/g, '' )
	)
		.replace( /\s+/g, ' ' )
		.trim();
}

function collectText( blocks: BlockNode[], out: string[] ): void {
	for ( const block of blocks ) {
		for ( const key of TEXT_ATTRIBUTES ) {
			const raw = block.attributes?.[ key ];
			if ( raw === undefined || raw === null || raw === '' ) {
				continue;
			}
			const text = stripMarkup( typeof raw === 'string' ? raw : String( raw ) );
			if ( text ) {
				out.push( text );
			}
		}
		if ( block.innerBlocks?.length ) {
			collectText( block.innerBlocks, out );
		}
	}
}

/**
 * Render a block tree to clean plain text in document order — the source for the
 * lexicon's `textContent` (brief §3: Bluesky computes reading-time + search from
 * it, ignoring the structured `content`).
 */
export function blocksToText( blocks: BlockNode[] ): string {
	const out: string[] = [];
	collectText( blocks, out );
	return out.join( '\n\n' );
}
