/**
 * The render-article module: one deep interface for turning a stored document
 * into safe HTML + plain text (Decision 0018).
 *
 * Turning a block tree into injectable HTML requires three calls in one
 * load-bearing order — `resolveBlobImageUrls` → `renderBlocks` →
 * `sanitizeArticleHtml` — and the text fallback (`textContent || blocksToText`)
 * alongside it. That ordering is the AGENTS.md #6b invariant (sanitise is the
 * LAST step before any injection); it lives here, once, so every read surface
 * (article page, RSS, future AMP/email/embeds) gets it by construction instead
 * of by convention. Like `render.ts` underneath, this module is dependency-free
 * and must never import `@wordpress/*` (Decision 0003).
 */
import { renderBlocks, blocksToText } from '../blocks/render';
import { resolveBlobImageUrls } from '../media/blob';
import { sanitizeArticleHtml } from './sanitize';
import type { BlockNode } from '../blocks/render';

/** The slice of a `site.standard.document` value the renderer consumes. */
export interface RenderableDocument {
	textContent?: string;
	content?: { blocks?: BlockNode[] };
}

export interface RenderedArticle {
	/** Sanitised article HTML, safe to inject (`set:html`, RSS CDATA, …). */
	html: string;
	/** Plain text: the stored `textContent`, else derived from the blocks. */
	text: string;
}

/**
 * Render a document's blocks to sanitised HTML and plain text. `author` is the
 * document's writer (current PDS + DID) — blob-backed image URLs are rebuilt
 * against it before rendering, so images survive a PDS migration.
 */
export function renderArticle(
	doc: RenderableDocument,
	author: { pdsUrl: string; did: string }
): RenderedArticle {
	const blocks = resolveBlobImageUrls( doc.content?.blocks ?? [], author );
	return {
		html: sanitizeArticleHtml( renderBlocks( blocks ) ),
		text: doc.textContent || blocksToText( blocks ),
	};
}
