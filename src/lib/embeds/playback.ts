// src/lib/embeds/playback.ts
/**
 * The trusted video playback hosts and the URLs the reader facade is allowed to
 * load. Kept tiny and host-exact: the facade script reconstructs the iframe `src`
 * from provider + id (never a raw URL from the document) and re-validates it with
 * `isTrustedPlaybackUrl` before insertion (AGENTS.md rule 6). Dependency-free.
 */
const PLAYBACK_HOSTS = [ 'www.youtube-nocookie.com', 'player.vimeo.com' ];

export function playbackUrl( provider: 'youtube' | 'vimeo', id: string ): string {
	const safeId = encodeURIComponent( id );
	return provider === 'youtube'
		? `https://www.youtube-nocookie.com/embed/${ safeId }?autoplay=1`
		: `https://player.vimeo.com/video/${ safeId }?autoplay=1`;
}

export function isTrustedPlaybackUrl( url: string ): boolean {
	try {
		const parsed = new URL( url );
		return parsed.protocol === 'https:' && PLAYBACK_HOSTS.includes( parsed.hostname );
	} catch {
		return false;
	}
}
