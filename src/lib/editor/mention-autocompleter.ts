import { createElement } from '@wordpress/element';
import { addFilter, hasFilter } from '@wordpress/hooks';
import { lookupActor, type ActorPreview } from '../landing/actor-lookup';

type LookupFn = ( query: string ) => Promise< ActorPreview | null >;

export interface MentionCompletion {
	action: 'replace';
	value: ReturnType< typeof createElement >;
}

/**
 * A block-editor autocompleter for `@mentions`. `options` queries the public Bluesky
 * AppView (reusing `actor-lookup`); selecting an account inserts the `skypress/mention`
 * anchor (class + href + data-did), with the DID resolved once, here, at pick time.
 */
export function createMentionCompleter( lookup: LookupFn = lookupActor ) {
	return {
		name: 'skypress/mention',
		triggerPrefix: '@',
		isDebounced: true,
		async options( query: string ): Promise< ActorPreview[] > {
			const trimmed = query.trim();
			if ( ! trimmed ) {
				return [];
			}
			const found = await lookup( trimmed );
			return found ? [ found ] : [];
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
			return {
				action: 'replace',
				value: createElement(
					'a',
					{
						href: `https://bsky.app/profile/${ option.handle }`,
						className: 'skypress-mention',
						'data-did': option.did,
					},
					`@${ option.handle }`
				),
			};
		},
	};
}

const MENTION_FILTER_NAMESPACE = 'skypress/mention-autocompleter';

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
		( completers: unknown ) => [ ...( completers as unknown[] ), completer ]
	);
}
