/**
 * Source of truth for reader error-page copy + HTTP status (SP12).
 *
 * Pure and dependency-free (no @wordpress, no network) so it can run on the read
 * path (AGENTS.md #3) and be unit-tested directly. Copy avoids em dashes by house
 * rule; the eyebrow uses a middle-dot kicker in SkyPress's editorial voice.
 */
export type ErrorKind =
	| 'writer-not-found'
	| 'publication-not-found'
	| 'article-not-found'
	| 'not-found'
	| 'server-error';

export interface ErrorContext {
	handle?: string;
	slug?: string;
	publicationName?: string;
}

export interface ErrorSceneCopy {
	status: number;
	eyebrow: string;
	heading: string;
	subline: string;
}

export function errorScene(
	kind: ErrorKind,
	context: ErrorContext = {}
): ErrorSceneCopy {
	switch ( kind ) {
		case 'writer-not-found':
			return {
				status: 404,
				eyebrow: '404 · no one by that name',
				heading: `No writer at @${ context.handle ?? '' }`,
				subline:
					'Nobody on the network goes by that handle yet. It might have a typo.',
			};
		case 'publication-not-found':
			return {
				status: 404,
				eyebrow: '404 · publication not found',
				heading: 'No publication by that name',
				subline: `@${ context.handle ?? '' } hasn't published anything under "${ context.slug ?? '' }".`,
			};
		case 'article-not-found':
			return {
				status: 404,
				eyebrow: '404 · story not found',
				heading: 'This story set below the horizon',
				subline: `It's no longer part of ${ context.publicationName ?? 'this publication' }. It may have been unpublished or moved.`,
			};
		case 'server-error':
			return {
				status: 500,
				eyebrow: '500 · overcast',
				heading: "The sky's a bit cloudy right now",
				subline:
					'Something went wrong on our end. Give it a moment, then try again.',
			};
		case 'not-found':
		default:
			return {
				status: 404,
				eyebrow: '404 · off the map',
				heading: 'This page set below the horizon',
				subline: "There's nothing to read at this address.",
			};
	}
}
