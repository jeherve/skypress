import { useEffect, useRef, useState } from 'react';
import { authorPath } from '../lib/auth/profile';

interface Props {
	displayName: string;
	handle: string | null;
	avatar: string | null;
	onSignOut: () => void;
}

/**
 * Signed-in account pill for the writing-first page: avatar + handle, opening a menu with
 * Manage publications (→ existing dashboard), Profile (public author page, omitted when no
 * handle), and Sign out. Management lives on the dashboard by design — the editor stays the
 * focus here (design 2026-06-17, Q5).
 */
export default function AccountPill( { displayName, handle, avatar, onSignOut }: Props ) {
	const [ open, setOpen ] = useState( false );
	const [ avatarOk, setAvatarOk ] = useState( true );
	const rootRef = useRef< HTMLDivElement >( null );

	useEffect( () => {
		if ( ! open ) {
			return;
		}
		function onDown( event: MouseEvent ) {
			if ( rootRef.current && ! rootRef.current.contains( event.target as Node ) ) {
				setOpen( false );
			}
		}
		document.addEventListener( 'mousedown', onDown );
		return () => document.removeEventListener( 'mousedown', onDown );
	}, [ open ] );

	const profileHref = authorPath( handle );

	return (
		<div className="account-pill" ref={ rootRef }>
			<button
				type="button"
				className="account-pill__trigger"
				aria-haspopup="menu"
				aria-expanded={ open }
				onClick={ () => setOpen( ( v ) => ! v ) }
			>
				{ avatar && avatarOk ? (
					<img
						className="account-pill__avatar"
						src={ avatar }
						alt=""
						width={ 28 }
						height={ 28 }
						onError={ () => setAvatarOk( false ) }
					/>
				) : (
					<span className="account-pill__avatar account-pill__avatar--fallback" aria-hidden="true">
						{ displayName.charAt( 0 ).toUpperCase() }
					</span>
				) }
				<span className="account-pill__handle">
					{ handle ? `@${ handle }` : displayName }
				</span>
			</button>
			{ open && (
				<div className="account-pill__menu" role="menu">
					<a className="account-pill__item" role="menuitem" href="/dashboard">
						Manage publications
					</a>
					{ profileHref && (
						<a className="account-pill__item" role="menuitem" href={ profileHref }>
							Profile
						</a>
					) }
					<button
						type="button"
						className="account-pill__item account-pill__item--button"
						role="menuitem"
						onClick={ onSignOut }
					>
						Sign out
					</button>
				</div>
			) }
		</div>
	);
}
