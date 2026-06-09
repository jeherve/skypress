import { useEffect, useRef, useState } from 'react';
import { Agent } from '@atproto/api';
import { createOAuthClient } from '../lib/auth/oauth';
import {
	fetchViewerProfile,
	displayNameFor,
	accountMenuItems,
	type ViewerProfile,
} from '../lib/auth/profile';

/**
 * Signed-in account menu for the home masthead. Restores the browser OAuth
 * session and, when signed in, renders an avatar + name + handle trigger with a
 * Dashboard / Write / Profile dropdown. Renders nothing when signed out or if
 * anything fails — it is non-critical chrome (the static "Write" link in the
 * masthead remains), so it never surfaces errors. While signed in it sets
 * `data-signed-in` on `.masthead__right` so CSS hides that static link.
 */
export default function AccountMenu() {
	const [ profile, setProfile ] = useState< ViewerProfile | null >( null );
	const [ open, setOpen ] = useState( false );
	const [ avatarOk, setAvatarOk ] = useState( true );
	const rootRef = useRef< HTMLDivElement >( null );
	const triggerRef = useRef< HTMLButtonElement >( null );

	// Restore the OAuth session and fetch the viewer's profile.
	useEffect( () => {
		let cancelled = false;
		( async () => {
			try {
				const client = await createOAuthClient();
				const result = await client.init();
				if ( cancelled || ! result?.session ) {
					return;
				}
				const next = await fetchViewerProfile( new Agent( result.session ), result.session.did );
				if ( ! cancelled ) {
					setProfile( next );
				}
			} catch {
				// Non-critical chrome: stay hidden on any failure.
			}
		} )();
		return () => {
			cancelled = true;
		};
	}, [] );

	// While signed in, mark the masthead so the static "Write" link is hidden.
	useEffect( () => {
		const right = rootRef.current?.closest( '.masthead__right' );
		if ( ! right ) {
			return;
		}
		right.setAttribute( 'data-signed-in', '' );
		return () => right.removeAttribute( 'data-signed-in' );
	}, [ profile ] );

	// Close the dropdown on outside click and on Escape.
	useEffect( () => {
		if ( ! open ) {
			return;
		}
		function onDown( event: MouseEvent ) {
			if ( rootRef.current && ! rootRef.current.contains( event.target as Node ) ) {
				setOpen( false );
			}
		}
		function onKey( event: KeyboardEvent ) {
			if ( event.key === 'Escape' ) {
				setOpen( false );
				triggerRef.current?.focus();
			}
		}
		document.addEventListener( 'mousedown', onDown );
		document.addEventListener( 'keydown', onKey );
		return () => {
			document.removeEventListener( 'mousedown', onDown );
			document.removeEventListener( 'keydown', onKey );
		};
	}, [ open ] );

	if ( ! profile ) {
		return null;
	}

	const name = displayNameFor( profile );
	const items = accountMenuItems( profile );

	return (
		<div
			className="account-menu"
			ref={ rootRef }
			onMouseEnter={ () => setOpen( true ) }
			onMouseLeave={ () => setOpen( false ) }
			onBlur={ ( event ) => {
				if ( ! rootRef.current?.contains( event.relatedTarget as Node ) ) {
					setOpen( false );
				}
			} }
		>
			<button
				ref={ triggerRef }
				type="button"
				className="account-menu__trigger"
				aria-haspopup="menu"
				aria-expanded={ open }
				aria-controls="account-menu-dropdown"
				onClick={ () => setOpen( ( value ) => ! value ) }
			>
				{ profile.avatar && avatarOk ? (
					<img
						className="account-menu__avatar"
						src={ profile.avatar }
						alt=""
						width={ 30 }
						height={ 30 }
						onError={ () => setAvatarOk( false ) }
					/>
				) : (
					<span className="account-menu__avatar account-menu__avatar--fallback" aria-hidden="true">
						{ name.charAt( 0 ).toUpperCase() }
					</span>
				) }
				<span className="account-menu__who">
					<span className="account-menu__name">{ name }</span>
					{ profile.handle && <span className="account-menu__handle">@{ profile.handle }</span> }
				</span>
			</button>
			{ open && (
				<div id="account-menu-dropdown" className="account-menu__dropdown" role="menu">
					{ items.map( ( item ) => (
						<a key={ item.href } className="account-menu__item" role="menuitem" href={ item.href }>
							{ item.label }
						</a>
					) ) }
				</div>
			) }
		</div>
	);
}
