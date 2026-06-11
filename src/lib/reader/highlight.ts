/**
 * Server-side syntax highlighting for the reader's code blocks (Decision: see
 * 2026-06-11 spec). Runs AFTER `renderBlocks` and BEFORE `sanitizeArticleHtml`
 * in `render-article.ts`: it wraps each block in `<code class="hljs language-…">`
 * and adds `<span class="hljs-…">` token spans — all of which the sanitiser already
 * allows, so sanitise stays the last step (AGENTS.md #6b).
 *
 * The `core/code` block stores no language, so we auto-detect among a CURATED
 * subset (fewer candidates → more accurate detection, leaner import). This module
 * is the only place `highlight.js` is imported; like `render.ts` it must never
 * import `@wordpress/*` (Decision 0003).
 */
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import php from 'highlight.js/lib/languages/php';
import python from 'highlight.js/lib/languages/python';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import scss from 'highlight.js/lib/languages/scss';
import sql from 'highlight.js/lib/languages/sql';
import yaml from 'highlight.js/lib/languages/yaml';
import markdown from 'highlight.js/lib/languages/markdown';
import diff from 'highlight.js/lib/languages/diff';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import { decodeEntities } from '../blocks/render';

const LANGUAGES: Record< string, Parameters< typeof hljs.registerLanguage >[ 1 ] > = {
	javascript,
	typescript,
	json,
	bash,
	php,
	python,
	xml,
	css,
	scss,
	sql,
	yaml,
	markdown,
	diff,
	go,
	rust,
};

for ( const [ name, lang ] of Object.entries( LANGUAGES ) ) {
	hljs.registerLanguage( name, lang );
}

// render.ts emits exactly this shape; content is entity-escaped, so `</code></pre>`
// only appears as our own delimiter, never inside a block's source.
const CODE_BLOCK = /<pre class="wp-block-code"><code>([\s\S]*?)<\/code><\/pre>/g;

function highlightOne( escapedSource: string ): string {
	// Stored code may use <br> for line breaks (render.ts passes it through and the
	// sanitiser keeps it as a real break). Turn those into real newlines BEFORE tokenising,
	// or the highlighter treats "<br>" as an xml tag and emits literal "<br>" text,
	// collapsing the code's line structure. Strip the breaks on the still-escaped source
	// so only genuine break tags are affected — a literal `<br>` typed in a code sample is
	// stored escaped (`&lt;br&gt;`) and must survive as text, not become a newline.
	const raw = decodeEntities( escapedSource.replace( /<br\s*\/?>/gi, '\n' ) );
	try {
		const { value, language, relevance } = hljs.highlightAuto( raw );
		// Zero relevance / no detected language → no useful tokens; keep it plain.
		if ( ! language || relevance === 0 ) {
			return `<pre class="wp-block-code"><code>${ escapedSource }</code></pre>`;
		}
		return `<pre class="wp-block-code"><code class="hljs language-${ language }">${ value }</code></pre>`;
	} catch {
		// Never let a highlighter error break a page — fall back to today's output.
		return `<pre class="wp-block-code"><code>${ escapedSource }</code></pre>`;
	}
}

/** Replace each rendered code block's body with highlight.js token markup. */
export function highlightCodeBlocks( html: string ): string {
	return html.replace( CODE_BLOCK, ( _full, inner: string ) => highlightOne( inner ) );
}

function escapeHtml( source: string ): string {
	return source
		.replace( /&/g, '&amp;' )
		.replace( /</g, '&lt;' )
		.replace( />/g, '&gt;' );
}

/**
 * Highlight a known-language source string into hljs token HTML, for static pages
 * (e.g. the lexicon's JSON schema dump) that know their language up front and so
 * skip the reader's auto-detection. Returns highlight.js's already-escaped token
 * HTML, safe to inject; on any error (unregistered language, etc.) it falls back to
 * plain entity-escaped text — the source still renders, never as raw markup. Keeping
 * this here preserves the rule that highlight.js is imported in this module only.
 */
export function highlightSource( source: string, language: string ): string {
	try {
		return hljs.highlight( source, { language } ).value;
	} catch {
		return escapeHtml( source );
	}
}
