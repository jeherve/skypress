import { useEffect, useState } from 'react';
import { Agent } from '@atproto/api';
import { createOAuthClient } from '../lib/auth/oauth';
import { fetchViewerProfile, displayNameFor, authorPath, type ViewerProfile } from '../lib/auth/profile';

/**
 * Read-only signed-in badge for the home masthead. Restores the browser OAuth
 * session and shows the viewer's avatar + name + handle, linking to their public
 * page. Renders nothing when signed out or if anything fails — it is non-critical
 * chrome, so it never surfaces errors (the editor is where auth errors live).
 */
export default function AuthorPill() {
	const [ profile, setProfile ] = useState< ViewerProfile | null >( null );
	const [ avatarOk, setAvatarOk ] = useState( true );

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

	if ( ! profile ) {
		return null;
	}

	const name = displayNameFor( profile );
	const href = authorPath( profile.handle );

	const inner = (
		<>
			{ profile.avatar && avatarOk ? (
				<img
					className="authorpill__avatar"
					src={ profile.avatar }
					alt=""
					width={ 30 }
					height={ 30 }
					onError={ () => setAvatarOk( false ) }
				/>
			) : (
				<span className="authorpill__avatar authorpill__avatar--fallback" aria-hidden="true">
					{ name.charAt( 0 ).toUpperCase() }
				</span>
			) }
			<span className="authorpill__who">
				<span className="authorpill__name">{ name }</span>
				{ profile.handle && <span className="authorpill__handle">@{ profile.handle }</span> }
			</span>
		</>
	);

	return href ? (
		<a className="authorpill" href={ href } aria-label={ `${ name } — view your public page` }>
			{ inner }
		</a>
	) : (
		<span className="authorpill">{ inner }</span>
	);
}
