import { useEffect, useRef, useState } from 'react';
import { createOAuthClient } from '../lib/auth/oauth';
import { isValidAccountInput, isValidHandleOrDid, normalizeHandle } from '../lib/auth/config';
import { lookupActor, type ActorPreview } from '../lib/landing/actor-lookup';

/**
 * The landing page's primary CTA (client-only). As you type a handle it debounces and
 * looks you up on the public Bluesky AppView, showing a confirmation card. Submitting
 * hands the raw value to the existing OAuth flow — Start ALWAYS works; the lookup is
 * delightful reassurance, never a gate (Decision: brainstorm 2026-06-09).
 */
export default function HandleStart() {
	const [ value, setValue ] = useState( '' );
	const [ preview, setPreview ] = useState< ActorPreview | null >( null );
	const [ looking, setLooking ] = useState( false );
	const [ error, setError ] = useState< string | null >( null );
	const [ avatarOk, setAvatarOk ] = useState( true );
	const reqId = useRef( 0 );

	// Debounced live lookup. Each keystroke cancels the pending timer; a request id
	// guards against out-of-order responses overwriting a newer query.
	useEffect( () => {
		const trimmed = value.trim();
		if ( ! isValidHandleOrDid( trimmed ) ) {
			// Invalidate any in-flight lookup so a late response can't repopulate the card.
			++reqId.current;
			setPreview( null );
			setLooking( false );
			return;
		}
		const id = ++reqId.current;
		setLooking( true );
		const timer = setTimeout( async () => {
			const found = await lookupActor( trimmed );
			if ( id === reqId.current ) {
				setPreview( found );
				setAvatarOk( true );
				setLooking( false );
			}
		}, 350 );
		return () => clearTimeout( timer );
	}, [ value ] );

	async function onSubmit( event: React.FormEvent ) {
		event.preventDefault();
		if ( ! isValidAccountInput( value ) ) {
			setError( 'Enter a handle (alice.bsky.social), a DID, or a PDS URL.' );
			return;
		}
		setError( null );
		try {
			const client = await createOAuthClient();
			// Redirects to the authorization server; the promise never resolves.
			await client.signIn( normalizeHandle( value ) );
		} catch ( err ) {
			setError( err instanceof Error ? err.message : String( err ) );
		}
	}

	const name = preview?.displayName ?? preview?.handle ?? null;

	return (
		<form className="handlestart" onSubmit={ onSubmit }>
			<div className="handlestart__row">
				<div className="handlestart__field">
					<span className="handlestart__at" aria-hidden="true">@</span>
					<input
						className="handlestart__input"
						name="handle"
						autoComplete="username"
						autoCapitalize="none"
						autoCorrect="off"
						spellCheck={ false }
						placeholder="you.bsky.social"
						aria-label="Your handle, DID, or PDS URL"
						value={ value }
						onChange={ ( e ) => setValue( e.target.value ) }
					/>
					{ looking && <span className="handlestart__spinner" aria-hidden="true" /> }
				</div>
				<button className="handlestart__go" type="submit">Start &rarr;</button>
			</div>

			{ preview && (
				<div className="handlestart__card" aria-live="polite">
					{ preview.avatar && avatarOk ? (
						<img
							className="handlestart__avatar"
							src={ preview.avatar }
							alt=""
							width={ 36 }
							height={ 36 }
							onError={ () => setAvatarOk( false ) }
						/>
					) : (
						<span className="handlestart__avatar handlestart__avatar--fallback" aria-hidden="true">
							{ ( name ?? '?' ).charAt( 0 ).toUpperCase() }
						</span>
					) }
					<span className="handlestart__who">
						<span className="handlestart__name">{ name }</span>
						<span className="handlestart__handle">@{ preview.handle }</span>
					</span>
					<span className="handlestart__check" aria-hidden="true">&#10003;</span>
				</div>
			) }

			{ error ? (
				<p className="handlestart__hint handlestart__hint--error" role="alert">{ error }</p>
			) : (
				<p className="handlestart__hint">Your handle, DID, or PDS — whatever you&rsquo;ve got.</p>
			) }
		</form>
	);
}
