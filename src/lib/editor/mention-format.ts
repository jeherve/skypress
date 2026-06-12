import { registerFormatType, store as richTextStore } from '@wordpress/rich-text';
import { select } from '@wordpress/data';

export const MENTION_FORMAT = 'skypress/mention';

/**
 * Settings accepted by `registerFormatType` at runtime. The bundled
 * `@wordpress/rich-text@7.24.0` `WPFormat` type is not re-exported from the package
 * index and omits the documented `attributes` map (HTML-attribute → format-attribute
 * key), so model it locally and pass it through a cast at the registration call below.
 */
type MentionFormatSettings = {
	title: string;
	tagName: string;
	className: string;
	attributes: Record< string, string >;
	edit: () => null;
};

/** Minimal shape of the rich-text store selector we depend on. */
type RichTextSelectors = {
	getFormatType: ( name: string ) => unknown;
};

/**
 * Register the `skypress/mention` rich-text format. It serializes to
 * `<a class="skypress-mention" href="{profile}" data-did="{did}">@{handle}</a>`.
 * The `class` survives the reader's sanitizer (so it can be styled and identified);
 * `data-did` is the publish-time marker (`collectMentions`) and is stripped from public
 * HTML by `sanitize.ts`. Inserted by the `@` autocompleter, not a toolbar button.
 */
export function registerMentionFormat(): void {
	// `@wordpress/rich-text@7.24.0` does not re-export `getFormatType` from its
	// index, so query the public store selector directly to stay idempotent
	// without triggering registerFormatType's "already registered" console.error.
	const selectors = select(
		richTextStore as unknown as Parameters< typeof select >[ 0 ]
	) as unknown as RichTextSelectors;
	if ( selectors.getFormatType( MENTION_FORMAT ) ) {
		return;
	}

	const settings: MentionFormatSettings = {
		title: 'Mention',
		tagName: 'a',
		className: 'skypress-mention',
		attributes: {
			url: 'href',
			did: 'data-did',
		},
		edit() {
			return null;
		},
	};

	registerFormatType(
		MENTION_FORMAT,
		settings as unknown as Parameters< typeof registerFormatType >[ 1 ]
	);
}
