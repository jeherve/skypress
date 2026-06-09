/**
 * The dashboard→editor "edit this article" link, and the editor-side parser for
 * it. Kept together so the `?edit=` param name has a single source of truth.
 * `rkey` uniquely identifies a document within the writer's repo, so it is all
 * the editor needs to re-fetch the article on load.
 */
const EDIT_PARAM = 'edit';

/** The editor URL that opens an existing article for editing. */
export function editLinkFor( rkey: string ): string {
	return `/editor?${ EDIT_PARAM }=${ rkey }`;
}

/** The rkey to edit, parsed from a URL search string (e.g. `window.location.search`). Null when absent or empty. */
export function editRkeyFromSearch( search: string ): string | null {
	const rkey = new URLSearchParams( search ).get( EDIT_PARAM );
	return rkey && rkey.length > 0 ? rkey : null;
}
