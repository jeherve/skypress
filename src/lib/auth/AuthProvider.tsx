import {
	createContext,
	useCallback,
	useEffect,
	useRef,
	useState,
	type ReactNode,
} from 'react';
import { Agent } from '@atproto/api';
import type { BrowserOAuthClient, OAuthSession } from '@atproto/oauth-client-browser';
import { createOAuthClient } from './oauth';
import {
	isValidAccountInput,
	normalizeHandle,
	getClientMode,
	redirectUriForLocation,
} from './config';
import { resolvePdsUrl } from '../media/pds';
import { fetchViewerProfile } from './profile';

export type AuthStatus = 'loading' | 'signed-out' | 'signed-in' | 'error';

export interface AuthContextValue {
	status: AuthStatus;
	agent: Agent | null;
	did: string | null;
	handle: string | null;
	displayName: string | null;
	avatar: string | null;
	/** The writer's PDS endpoint (for getBlob URLs); null until resolved. */
	pdsUrl: string | null;
	error: string | null;
	signIn: ( input: string ) => Promise< void >;
	signOut: () => Promise< void >;
}

export const AuthContext = createContext< AuthContextValue | null >( null );

export function AuthProvider( { children }: { children: ReactNode } ) {
	const clientRef = useRef< BrowserOAuthClient | null >( null );
	const [ status, setStatus ] = useState< AuthStatus >( 'loading' );
	const [ agent, setAgent ] = useState< Agent | null >( null );
	const [ did, setDid ] = useState< string | null >( null );
	const [ handle, setHandle ] = useState< string | null >( null );
	const [ displayName, setDisplayName ] = useState< string | null >( null );
	const [ avatar, setAvatar ] = useState< string | null >( null );
	const [ pdsUrl, setPdsUrl ] = useState< string | null >( null );
	const [ error, setError ] = useState< string | null >( null );

	const adoptSession = useCallback( async ( session: OAuthSession ) => {
		const nextAgent = new Agent( session );
		setAgent( nextAgent );
		setDid( session.did );
		setStatus( 'signed-in' );
		setError( null );
		const profile = await fetchViewerProfile( nextAgent, session.did );
		setHandle( profile.handle );
		setDisplayName( profile.displayName );
		setAvatar( profile.avatar );
		try {
			setPdsUrl( await resolvePdsUrl( session.did ) );
		} catch {
			setPdsUrl( null ); // image upload stays disabled if the PDS can't be resolved
		}
	}, [] );

	// Initialise once: process an OAuth callback or restore an existing session.
	useEffect( () => {
		let cancelled = false;

		( async () => {
			try {
				const client = await createOAuthClient();
				if ( cancelled ) {
					return;
				}
				clientRef.current = client;

				const result = await client.init();
				if ( cancelled ) {
					return;
				}
				if ( result?.session ) {
					await adoptSession( result.session );
				} else {
					setStatus( 'signed-out' );
				}
			} catch ( err ) {
				if ( ! cancelled ) {
					setError( err instanceof Error ? err.message : String( err ) );
					setStatus( 'error' );
				}
			}
		} )();

		return () => {
			cancelled = true;
		};
	}, [ adoptSession ] );

	const signIn = useCallback( async ( input: string ) => {
		const client = clientRef.current;
		if ( ! client ) {
			return;
		}
		if ( ! isValidAccountInput( input ) ) {
			setError( 'Enter a handle (alice.bsky.social), a DID, or a PDS URL.' );
			return;
		}
		setError( null );
		try {
			// Hosted (prod) registers several redirect URIs (one per OAuth-island route),
			// and atproto defaults to the first — so without this, signing in from /write
			// always returned the writer to /editor, losing the in-progress draft. Pin the
			// round-trip to the page sign-in started from. In loopback (dev) the client's
			// single redirect URI already equals the current page, so we pass nothing.
			// atproto brands `redirect_uri` as a URL template type; the value is a registered
			// app URL (and atproto re-validates it against the client metadata), so cast the
			// options object to the `signIn` parameter type.
			const options =
				getClientMode( window.location.hostname ) === 'hosted'
					? ( {
							redirect_uri: redirectUriForLocation(
								window.location.origin,
								window.location.pathname
							),
					  } as Parameters< BrowserOAuthClient[ 'signIn' ] >[ 1 ] )
					: undefined;
			// Redirects to the user's authorization server; the promise never resolves.
			await client.signIn( normalizeHandle( input ), options );
		} catch ( err ) {
			setError( err instanceof Error ? err.message : String( err ) );
		}
	}, [] );

	const signOut = useCallback( async () => {
		const client = clientRef.current;
		if ( client && did ) {
			try {
				await client.revoke( did );
			} catch {
				// best effort — fall through to local reset
			}
		}
		setAgent( null );
		setDid( null );
		setHandle( null );
		setDisplayName( null );
		setAvatar( null );
		setPdsUrl( null );
		setStatus( 'signed-out' );
	}, [ did ] );

	return (
		<AuthContext.Provider
			value={ { status, agent, did, handle, displayName, avatar, pdsUrl, error, signIn, signOut } }
		>
			{ children }
		</AuthContext.Provider>
	);
}
