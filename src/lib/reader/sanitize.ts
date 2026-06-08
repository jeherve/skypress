import sanitizeHtml from 'sanitize-html';

/**
 * Sanitise rendered article HTML before injecting it into a reading page.
 *
 * Article content comes from arbitrary PDSes and is UNTRUSTED — a malicious record
 * could embed `<script>`/`onerror`/etc. We allow only the tags + attributes the curated
 * blocks (Decision 0002) and inline rich text produce; everything else is stripped.
 * External links get `rel="noopener noreferrer nofollow ugc"` and open in a new tab.
 */
const OPTIONS: sanitizeHtml.IOptions = {
	allowedTags: [
		'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
		'ul', 'ol', 'li',
		'blockquote', 'cite',
		'pre', 'code', 'kbd',
		'hr', 'figure', 'figcaption', 'img',
		'strong', 'em', 'b', 'i', 's', 'del', 'ins', 'sub', 'sup', 'mark',
		'a', 'br', 'span',
	],
	allowedAttributes: {
		a: [ 'href', 'title', 'rel', 'target' ],
		img: [ 'src', 'alt' ],
		'*': [ 'class' ],
	},
	allowedSchemes: [ 'http', 'https', 'mailto' ],
	allowedSchemesByTag: { img: [ 'http', 'https' ] },
	transformTags: {
		a: sanitizeHtml.simpleTransform( 'a', {
			rel: 'noopener noreferrer nofollow ugc',
			target: '_blank',
		} ),
	},
};

export function sanitizeArticleHtml( html: string ): string {
	return sanitizeHtml( html, OPTIONS );
}
