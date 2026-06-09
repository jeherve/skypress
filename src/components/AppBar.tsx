import { useState } from 'react';
import { useAuth } from '../lib/auth/useAuth';
import { displayNameFor, authorPath } from '../lib/auth/profile';
import { appBarNav, type AppBarContext } from '../lib/auth/nav';

/** Inline SkyPress mark — mirrors Logo.astro (that one is Astro-only, unusable in a React island). */
function LogoMark() {
	return (
		<svg
			className="app-bar__mark"
			width={ 24 }
			height={ 24 }
			viewBox="0 0 32 32"
			fill="none"
			aria-hidden="true"
		>
			<rect x="2.5" y="2.5" width="27" height="27" rx="7.5" stroke="currentColor" strokeWidth="2.2" />
			<circle cx="16" cy="12.5" r="3.6" stroke="currentColor" strokeWidth="1.9" />
			<circle cx="16" cy="12.5" r="0.9" fill="currentColor" />
			<path d="M7 18.5h18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
			<path d="M9 22.8h14M9 25.6h9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" opacity="0.55" />
		</svg>
	);
}

function NavIcon( { name }: { name: 'feather' | 'publications' } ) {
	if ( name === 'feather' ) {
		return (
			<svg className="app-bar__navicon" viewBox="0 0 24 24" width={ 18 } height={ 18 } fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
				<path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
				<line x1="16" y1="8" x2="2" y2="22" />
				<line x1="17.5" y1="15" x2="9" y2="15" />
			</svg>
		);
	}
	return (
		<svg className="app-bar__navicon" viewBox="0 0 24 24" width={ 18 } height={ 18 } fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
			<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
			<path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
		</svg>
	);
}

/**
 * The shared top bar for the editor + dashboard islands. Logo on the left;
 * contextual nav + account + sign-out on the right. Rendered inside AuthProvider
 * in every auth state: logo-only while loading, + nav when signed out, + account
 * and sign-out when signed in.
 */
export default function AppBar( { current }: { current: AppBarContext } ) {
	const { status, handle, displayName, avatar, did, signOut } = useAuth();
	const [ avatarOk, setAvatarOk ] = useState( true );
	const nav = appBarNav( current );
	const signedIn = status === 'signed-in' && Boolean( did );

	const viewerName = did
		? displayNameFor( { did, handle, displayName, avatar } )
		: '';
	const profileHref = authorPath( handle );

	return (
		<header className="app-bar">
			<a className="app-bar__home" href="/" aria-label="SkyPress home">
				<LogoMark />
				<span className="app-bar__word">SkyPress</span>
			</a>

			<span className="app-bar__spacer" />

			{ status !== 'loading' && (
				<a className="app-bar__nav" href={ nav.href }>
					<NavIcon name={ nav.icon } />
					{ nav.label }
				</a>
			) }

			{ signedIn && (
				<>
					<IdentityBlock
						href={ profileHref }
						name={ viewerName }
						handle={ handle }
						avatar={ avatar }
						avatarOk={ avatarOk }
						onAvatarError={ () => setAvatarOk( false ) }
					/>
					<button type="button" className="app-bar__signout" onClick={ () => void signOut() }>
						Sign out
					</button>
				</>
			) }
		</header>
	);
}

/** Avatar + name + @handle. The whole block links to the public author page when a handle is known. */
function IdentityBlock( {
	href,
	name,
	handle,
	avatar,
	avatarOk,
	onAvatarError,
}: {
	href: string | null;
	name: string;
	handle: string | null;
	avatar: string | null;
	avatarOk: boolean;
	onAvatarError: () => void;
} ) {
	const inner = (
		<>
			{ avatar && avatarOk ? (
				<img
					className="app-bar__avatar"
					src={ avatar }
					alt=""
					width={ 30 }
					height={ 30 }
					onError={ onAvatarError }
				/>
			) : (
				<span className="app-bar__avatar app-bar__avatar--fallback" aria-hidden="true">
					{ name.charAt( 0 ).toUpperCase() }
				</span>
			) }
			<span className="app-bar__who">
				<strong className="app-bar__name">{ name }</strong>
				{ handle && <span className="app-bar__handle">@{ handle }</span> }
			</span>
		</>
	);

	return href ? (
		<a className="app-bar__identity" href={ href }>
			{ inner }
		</a>
	) : (
		<span className="app-bar__identity">{ inner }</span>
	);
}
