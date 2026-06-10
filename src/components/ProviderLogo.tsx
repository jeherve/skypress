import { KNOWN_PROVIDERS, type ProviderId } from '../lib/publish/providers';

/**
 * A small monochrome logo for a recognised foreign-publication provider (Leaflet, pckt,
 * …). Renders nothing for an unrecognised provider, so callers can pass `provider`
 * straight through. The glyph inherits `currentColor`; size it with the `size` prop.
 *
 * Shares its glyph + label data with the reader's `ProviderLogo.astro` via
 * `lib/publish/providers` — the detection/asset core lives there, not in either renderer.
 */
export default function ProviderLogo( {
	provider,
	size = 14,
	className,
}: {
	provider: ProviderId | null;
	size?: number;
	className?: string;
} ) {
	if ( ! provider ) {
		return null;
	}
	// `body` is a hardcoded constant from our own registry (never user/PDS content), and
	// `provider` is constrained to the ProviderId union — so this innerHTML is trusted.
	const { label, viewBox, body } = KNOWN_PROVIDERS[ provider ];
	return (
		<svg
			className={ className }
			width={ size }
			height={ size }
			viewBox={ viewBox }
			role="img"
			aria-label={ label }
			dangerouslySetInnerHTML={ { __html: body } }
		/>
	);
}
