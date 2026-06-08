import type { AuthStatus } from './AuthProvider';

/**
 * Whether the signed-in viewer owns the profile being viewed.
 *
 * The public author page resolves the profile DID server-side; the viewer DID
 * comes from the browser-only auth session. The CTA to create a publication is
 * meaningful only to the owner, since publications are always written under the
 * viewer's own DID.
 */
export function isProfileOwner(
	status: AuthStatus,
	viewerDid: string | null,
	profileDid: string
): boolean {
	return status === 'signed-in' && viewerDid !== null && viewerDid === profileDid;
}
