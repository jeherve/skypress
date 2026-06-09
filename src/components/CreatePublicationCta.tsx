import { AuthProvider } from '../lib/auth/AuthProvider';
import { useAuth } from '../lib/auth/useAuth';
import { isProfileOwner } from '../lib/auth/cta';

/**
 * Owner-only CTA shown beneath the public author page's empty state. Renders
 * nothing unless the signed-in viewer owns this profile, so logged-out visitors
 * and other writers just see the static "No SkyPress publications yet." line.
 *
 * Reading-page island: imports only the `@wordpress`-free auth chain (AGENTS.md
 * rules 3 & 7). Mounted with `client:only="react"`.
 */
function Cta( { profileDid }: { profileDid: string } ) {
	const { status, did } = useAuth();
	if ( ! isProfileOwner( status, did, profileDid ) ) {
		return null;
	}
	return (
		<a className="btn btn--primary" href="/dashboard">
			Create your first publication
		</a>
	);
}

export default function CreatePublicationCta( { profileDid }: { profileDid: string } ) {
	return (
		<AuthProvider>
			<Cta profileDid={ profileDid } />
		</AuthProvider>
	);
}
