import { useEffect, useRef, useState } from 'react';
import { AuthProvider } from '../lib/auth/AuthProvider';
import { useAuth } from '../lib/auth/useAuth';
import { subscribe, unsubscribe, fetchSubscriptionUri } from '../lib/subscribe/subscriptions';
import { saveSubscribeIntent, consumeSubscribeIntent } from '../lib/subscribe/intent';

export interface SubscribeButtonProps {
	/** The `site.standard.publication` AT-URI the reader subscribes to. */
	publicationUri: string;
	/** Publication name, for the sign-in prompt copy. */
	publicationName?: string;
}

/**
 * The signed-in / signed-out subscribe control. Renders inside <AuthProvider>; reads the
 * reader's existing subscription to this publication (to toggle), and writes/deletes a
 * `site.standard.graph.subscription` record on the reader's own PDS.
 *
 * Deliberately scoped: no subscriber count, no following feed — those need cross-PDS
 * aggregation (relay territory the brief rules out). This is purely the reader's own follow.
 */
export function SubscribeGate( { publicationUri, publicationName }: SubscribeButtonProps ) {
	const { status, agent, did, signIn, error: authError } = useAuth();

	// The reader's existing subscription record URI for this publication, or null if not
	// subscribed. `undefined` = not yet loaded (signed-in readers only).
	const [ subscriptionUri, setSubscriptionUri ] = useState< string | null | undefined >( undefined );
	const [ busy, setBusy ] = useState( false );
	const [ errorMsg, setErrorMsg ] = useState< string | null >( null );
	const [ handle, setHandle ] = useState( '' );

	// Guards a late setState after unmount (toggles run from event handlers).
	const mounted = useRef( true );
	useEffect( () => () => {
		mounted.current = false;
	}, [] );

	// Fires the pending-intent auto-subscribe at most once per mount (see the effect below).
	const autoSubscribeRan = useRef( false );

	// Load the reader's current subscription state once auth settles. Best-effort: a failed
	// read just leaves the button in its "Subscribe" state rather than blocking the action.
	useEffect( () => {
		if ( status !== 'signed-in' || ! agent || ! did ) {
			return;
		}
		let cancelled = false;
		fetchSubscriptionUri( agent, did, publicationUri )
			.then( ( uri ) => ! cancelled && setSubscriptionUri( uri ) )
			.catch( () => ! cancelled && setSubscriptionUri( null ) );
		return () => {
			cancelled = true;
		};
	}, [ status, agent, did, publicationUri ] );

	// Auto-complete a subscribe that began signed-out. A reader who hit "Sign in to subscribe"
	// stashed the target publication (`subscribe/intent`) before the OAuth redirect; on return
	// — signed-in, and once the current subscription state has loaded — we consume that intent
	// and, if it targets THIS publication and the reader isn't already subscribed, write the
	// record so the button's promise actually holds. Fires at most once (ref + storage consume),
	// after the load effect above resolves `subscriptionUri` away from `undefined`.
	useEffect( () => {
		if ( status !== 'signed-in' || ! agent || ! did ) {
			return;
		}
		if ( subscriptionUri === undefined || autoSubscribeRan.current ) {
			return;
		}
		autoSubscribeRan.current = true;
		const intended = consumeSubscribeIntent();
		if ( intended !== publicationUri || subscriptionUri !== null ) {
			return; // no intent, an intent for another publication, or already subscribed
		}
		setBusy( true );
		setErrorMsg( null );
		subscribe( agent, did, publicationUri )
			.then( ( uri ) => mounted.current && setSubscriptionUri( uri ) )
			.catch(
				( err ) =>
					mounted.current &&
					setErrorMsg( errorText( err, 'Could not update your subscription.' ) )
			)
			.finally( () => mounted.current && setBusy( false ) );
	}, [ status, agent, did, publicationUri, subscriptionUri ] );

	const onToggle = async () => {
		if ( ! agent || ! did || busy ) {
			return;
		}
		setBusy( true );
		setErrorMsg( null );
		try {
			if ( subscriptionUri ) {
				await unsubscribe( agent, did, subscriptionUri );
				if ( mounted.current ) {
					setSubscriptionUri( null );
				}
			} else {
				const uri = await subscribe( agent, did, publicationUri );
				if ( mounted.current ) {
					setSubscriptionUri( uri );
				}
			}
		} catch ( err ) {
			if ( mounted.current ) {
				setErrorMsg( errorText( err, 'Could not update your subscription.' ) );
			}
		} finally {
			if ( mounted.current ) {
				setBusy( false );
			}
		}
	};

	if ( status === 'loading' ) {
		return <div className="subscribe subscribe--loading">Loading…</div>;
	}

	// Signed-out: prompt sign-in (same OAuth flow as the post-actions bar and the editor).
	if ( status !== 'signed-in' || ! agent || ! did ) {
		return (
			<div className="subscribe">
				<form
					className="subscribe__signin"
					onSubmit={ ( event ) => {
						event.preventDefault();
						// Remember the target publication and this page so the full-page OAuth
						// round-trip (via the static /oauth/callback/ route in prod) returns here
						// and auto-writes the subscription — sign-in alone wouldn't subscribe.
						saveSubscribeIntent( publicationUri );
						void signIn( handle, { returnTo: window.location.pathname } );
					} }
				>
					<input
						className="subscribe__signin-input"
						aria-label="Your handle, DID, or PDS URL"
						autoComplete="username"
						autoCapitalize="none"
						autoCorrect="off"
						spellCheck={ false }
						placeholder="alice.bsky.social"
						value={ handle }
						onChange={ ( event ) => setHandle( event.target.value ) }
					/>
					<button className="subscribe__btn" type="submit">
						Sign in to subscribe
					</button>
				</form>
				{ authError && (
					<p className="subscribe__error" role="alert">
						{ authError }
					</p>
				) }
				<p className="subscribe__note">
					Following { publicationName ? `“${ publicationName }”` : 'this publication' } records a
					subscription in your own AT&nbsp;Protocol repo.
				</p>
			</div>
		);
	}

	const subscribed = Boolean( subscriptionUri );

	return (
		<div className="subscribe">
			<button
				type="button"
				className={ `subscribe__btn${ subscribed ? ' is-active' : '' }` }
				aria-pressed={ subscribed }
				disabled={ busy || subscriptionUri === undefined }
				onClick={ onToggle }
			>
				{ subscriptionUri === undefined
					? 'Subscribe'
					: subscribed
					? '✓ Subscribed'
					: 'Subscribe' }
			</button>
			{ errorMsg && (
				<p className="subscribe__error" role="alert">
					{ errorMsg }
				</p>
			) }
			<p className="subscribe__note">
				Your subscription is a public record in your own AT&nbsp;Protocol repo.
			</p>
		</div>
	);
}

function errorText( err: unknown, fallback: string ): string {
	const detail = err instanceof Error ? err.message : '';
	return detail ? `${ fallback } ${ detail }` : fallback;
}

export default function SubscribeButton( props: SubscribeButtonProps ) {
	return (
		<AuthProvider>
			<SubscribeGate { ...props } />
		</AuthProvider>
	);
}
