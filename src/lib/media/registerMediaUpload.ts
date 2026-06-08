import { addFilter } from '@wordpress/hooks';

/**
 * Disable Gutenberg's WordPress media library in the SkyPress editor.
 *
 * `@automattic/isolated-block-editor` bundles `@wordpress/editor`'s media-upload hook,
 * which registers the `@wordpress/media-utils` `MediaUpload` component on the
 * `editor.MediaUpload` filter. That component opens the legacy Backbone media frame via
 * `wp.media(...)` — a global SkyPress never loads — so the Image block's "Media Library"
 * button throws (`can't access property "media", … is undefined`).
 *
 * SkyPress has no media library: images upload straight to the writer's PDS as blobs
 * (Decision 0006) through the "Upload" / drop-zone path, which uses the custom
 * `settings.editor.mediaUpload` handler and is independent of this component. So we
 * override the filter with a no-render component, removing the broken (and inapplicable)
 * "Media Library" button everywhere it appears (placeholder, Replace flow).
 *
 * Importing this module registers the filter as a side effect. It must be imported AFTER
 * `isolated-block-editor` so our filter runs last and wins.
 */
const NoMediaLibrary = (): null => null;

addFilter( 'editor.MediaUpload', 'skypress/disable-media-library', () => NoMediaLibrary );
