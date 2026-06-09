/**
 * Build the list of Open Graph + Twitter Card <meta> tags for a page.
 *
 * Pure and dependency-free so it is unit-testable and safe to call from the
 * server-rendered Base layout (the read path must not pull in browser-only deps).
 * `og:*` tags use the `property` attribute; `twitter:*` tags use `name`.
 */
export interface MetaTagInput {
	title: string;
	/** Page description. When absent, og:description / twitter:description are omitted. */
	description?: string;
	/** Absolute canonical URL of the page. */
	url: string;
	/** Absolute URL of the share image. */
	image: string;
	/** Site name (e.g. "SkyPress"). */
	siteName: string;
	/** Open Graph object type. Defaults to "website". */
	type?: string;
	/** Alt text for the share image. Omitted when absent. */
	imageAlt?: string;
	/** Intrinsic image width in px. Emitted only when both width AND height are given. */
	imageWidth?: number;
	/** Intrinsic image height in px. Emitted only when both width AND height are given. */
	imageHeight?: number;
}

export interface MetaTag {
	property?: string;
	name?: string;
	content: string;
}

export function buildMetaTags( input: MetaTagInput ): MetaTag[] {
	const {
		title,
		description,
		url,
		image,
		siteName,
		type = 'website',
		imageAlt,
		imageWidth,
		imageHeight,
	} = input;

	const tags: MetaTag[] = [
		{ property: 'og:title', content: title },
		{ property: 'og:type', content: type },
		{ property: 'og:url', content: url },
		{ property: 'og:site_name', content: siteName },
		{ property: 'og:image', content: image },
	];

	if ( imageWidth !== undefined && imageHeight !== undefined ) {
		tags.push( { property: 'og:image:width', content: String( imageWidth ) } );
		tags.push( { property: 'og:image:height', content: String( imageHeight ) } );
	}

	tags.push(
		{ name: 'twitter:card', content: 'summary_large_image' },
		{ name: 'twitter:title', content: title },
		{ name: 'twitter:image', content: image }
	);

	if ( description ) {
		tags.push( { property: 'og:description', content: description } );
		tags.push( { name: 'twitter:description', content: description } );
	}

	if ( imageAlt ) {
		tags.push( { property: 'og:image:alt', content: imageAlt } );
	}

	return tags;
}
