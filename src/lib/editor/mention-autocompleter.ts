import { createElement } from '@wordpress/element';
import { addFilter, hasFilter } from '@wordpress/hooks';
import { searchActors, type ActorPreview } from '../landing/actor-lookup';
import { atmosphereProfileUrl } from '../social/atmosphere-url';

type SearchFn = ( query: string ) => Promise< ActorPreview[] >;

/**
 * The inline value an option completes to: a `skypress/mention` anchor element. Returning
 * the element directly (rather than a `{ action: 'replace' }` object) makes the block editor
 * insert it AT THE CARET in place of the typed `@query` — the same pattern as the core link
 * completer. `action: 'replace'` would instead try to swap out the whole block, dropping the
 * inline anchor.
 */
export type MentionCompletion = ReturnType< typeof createElement >;

/**
 * A block-editor autocompleter for `@mentions`. `options` runs a typeahead search against
 * the public Bluesky AppView (`searchActors`), so a short list of matching accounts appears
 * as the writer types a partial name — not only when they type a complete, valid handle.
 * Selecting an account inserts the `skypress/mention` anchor (class + href + data-did), with
 * the DID resolved once, here, at pick time.
 */
export function createMentionCompleter( search: SearchFn = searchActors ) {
	return {
		name: 'skypress/mention',
		triggerPrefix: '@',
		isDebounced: true,
		async options( query: string ): Promise< ActorPreview[] > {
			const trimmed = query.trim();
			if ( ! trimmed ) {
				return [];
			}
			return search( trimmed );
		},
		getOptionKeywords( option: ActorPreview ): string[] {
			return [ option.handle, option.displayName ?? '' ].filter( Boolean );
		},
		getOptionLabel( option: ActorPreview ) {
			return createElement(
				'span',
				{ className: 'skypress-mention-option' },
				option.avatar
					? createElement( 'img', {
							src: option.avatar,
							alt: '',
							width: 20,
							height: 20,
							className: 'skypress-mention-option__avatar',
					  } )
					: null,
				createElement(
					'span',
					{ className: 'skypress-mention-option__name' },
					option.displayName ?? option.handle
				),
				createElement(
					'span',
					{ className: 'skypress-mention-option__handle' },
					`@${ option.handle }`
				)
			);
		},
		getOptionCompletion( option: ActorPreview ): MentionCompletion {
			return createElement(
				'a',
				{
					href: atmosphereProfileUrl( option.handle ),
					className: 'skypress-mention',
					'data-did': option.did,
				},
				`@${ option.handle }`
			);
		},
	};
}

const MENTION_FILTER_NAMESPACE = 'skypress/mention-autocompleter';

/**
 * Swap WordPress's built-in `@` user-mention completer for the SkyPress one. The built-in
 * completer queries `/wp/v2/users` (which 404s — SkyPress has no WP user table) and, because
 * the block editor's `Autocomplete` resolves a trigger to the FIRST completer that claims it,
 * appending ours leaves the built-in `@` completer shadowing it. So we drop every existing
 * `@`-triggered completer and add ours in their place.
 */
export function replaceAtMentionCompleter(
	completers: unknown,
	mention: ReturnType< typeof createMentionCompleter >
): unknown[] {
	const list = Array.isArray( completers ) ? completers : [];
	return [
		...list.filter(
			( c ) => ( c as { triggerPrefix?: string } )?.triggerPrefix !== '@'
		),
		mention,
	];
}

/** Add the mention completer to every RichText instance in the editor (idempotent). */
export function registerMentionAutocompleter(): void {
	if ( hasFilter( 'editor.Autocomplete.completers', MENTION_FILTER_NAMESPACE ) ) {
		return;
	}
	const completer = createMentionCompleter();
	addFilter(
		'editor.Autocomplete.completers',
		MENTION_FILTER_NAMESPACE,
		// @wordpress/hooks types the callback as (...args) => unknown; cast the first arg.
		( completers: unknown ) => replaceAtMentionCompleter( completers, completer )
	);
}
