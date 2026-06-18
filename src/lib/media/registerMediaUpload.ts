import { addFilter } from '@wordpress/hooks';

/**
 * Disable Gutenberg's WordPress media library in the SkyPress editor.
 *
 * `@wordpress/block-editor`'s `MediaUpload` component renders the Image block's "Media
 * Library" button by resolving the `editor.MediaUpload` filter. The default component
 * opens the legacy Backbone media frame via `wp.media(...)` — a global SkyPress never
 * loads — so that button throws (`can't access property "media", … is undefined`).
 *
 * SkyPress has no media library: images upload straight to the writer's PDS as blobs
 * (Decision 0006) through the "Upload" / drop-zone path, which uses the custom
 * `settings.mediaUpload` handler and is independent of this component. So we override the
 * filter with a no-render component, removing the broken (and inapplicable) "Media
 * Library" button everywhere it appears (placeholder, Replace flow).
 *
 * Importing this module registers the filter as a side effect. It must be imported AFTER
 * `@wordpress/block-editor` so our filter runs last and wins.
 */
const NoMediaLibrary = (): null => null;

addFilter( 'editor.MediaUpload', 'skypress/disable-media-library', () => NoMediaLibrary );
