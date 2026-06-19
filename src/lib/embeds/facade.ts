// src/lib/embeds/facade.ts
/**
 * Client-side activation of a video-embed facade. The play button carries only
 * provider + id (set by trusted card code, Task 2); we reconstruct the playback
 * URL with `playbackUrl` and re-validate it with `isTrustedPlaybackUrl` before
 * inserting the iframe (AGENTS.md rule 6) — a hostile document can never reach an
 * arbitrary `src`. Dependency-free.
 */
import { playbackUrl, isTrustedPlaybackUrl } from './playback';

export function activatePlay( button: HTMLElement ): void {
	const provider = button.dataset.embedProvider;
	const id = button.dataset.embedId;
	if ( ( provider !== 'youtube' && provider !== 'vimeo' ) || ! id ) {
		return;
	}
	const src = playbackUrl( provider, id );
	if ( ! isTrustedPlaybackUrl( src ) ) {
		return;
	}
	const iframe = document.createElement( 'iframe' );
	iframe.setAttribute( 'src', src );
	iframe.setAttribute( 'allow', 'autoplay; fullscreen; picture-in-picture' );
	iframe.setAttribute( 'allowfullscreen', 'true' );
	iframe.setAttribute( 'loading', 'lazy' );
	iframe.className = 'skypress-embed__iframe';
	button.replaceWith( iframe );
}

export function initEmbedFacades( root: ParentNode = document ): void {
	root.addEventListener( 'click', ( event ) => {
		const button = ( event.target as HTMLElement )?.closest?.( '.skypress-embed__play' );
		if ( button instanceof HTMLElement ) {
			activatePlay( button );
		}
	} );
}
