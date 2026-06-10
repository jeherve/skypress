import { useEffect, useRef, useState } from 'react';
import { AuthProvider } from '../lib/auth/AuthProvider';
import { useAuth } from '../lib/auth/useAuth';
import {
	like,
	unlike,
	repost,
	unrepost,
	postReply,
	postQuote,
	fetchPostState,
	fetchPostExists,
	type PostState,
} from '../lib/social/interactions';
import {
	graphemeLength,
	validateReplyText,
	bskyPostWebUrl,
	MAX_REPLY_GRAPHEMES,
	type StrongRef,
} from '../lib/social/records';

export interface PostActionsProps {
	/** The companion `app.bsky.feed.post` AT-URI (the article's Bluesky post). */
	postUri: string;
	/** Its cid — together with `postUri` it forms the strongRef every action targets. */
	postCid: string;
}

type Composer = 'reply' | 'quote' | null;

/** A composed reply/quote in flight, surfaced as a success or error banner. */
interface Flash {
	kind: 'success' | 'error';
	message: string;
	/** For a success, the bsky.app link to the freshly created post. */
	href?: string;
}

/**
 * The signed-in / signed-out action bar. Renders inside <AuthProvider>; reads the
 * companion post's counts + the viewer's like/repost state, and writes like / repost /
 * reply / quote records to the reader's own PDS.
 */
export function ActionsGate( { postUri, postCid }: PostActionsProps ) {
	const { status, agent, did, signIn, error: authError } = useAuth();
	const subject: StrongRef = { uri: postUri, cid: postCid };

	const [ state, setState ] = useState< PostState | null >( null );
	// Whether the companion Bluesky post still exists. Optimistic: we show the bar and only
	// hide it once a read confirms the post is gone — a transient error must never hide a
	// live post, and this keeps the common (post present) case flicker-free.
	const [ present, setPresent ] = useState( true );
	const [ busy, setBusy ] = useState< null | 'like' | 'repost' >( null );
	const [ composer, setComposer ] = useState< Composer >( null );
	const [ text, setText ] = useState( '' );
	const [ submitting, setSubmitting ] = useState( false );
	const [ flash, setFlash ] = useState< Flash | null >( null );
	const [ handle, setHandle ] = useState( '' );

	// Guards a late `refresh()` setState after unmount (refresh runs from event
	// handlers, so it can't rely on an effect cleanup like the mount load below).
	const mounted = useRef( true );
	useEffect( () => () => {
		mounted.current = false;
	}, [] );

	// Resolve the companion post once auth settles: signed-in readers get counts + viewer
	// state from an authenticated read (a `null` result means the post is gone); signed-out
	// readers get an unauthenticated existence check (only a definitive `false` hides the
	// bar — `true`/`null` keep it, so a transient error fails open).
	useEffect( () => {
		if ( status === 'loading' ) {
			return; // wait for auth before choosing the read path
		}
		let cancelled = false;
		if ( status === 'signed-in' && agent ) {
			fetchPostState( agent, postUri )
				.then( ( next ) => {
					if ( cancelled ) {
						return;
					}
					if ( next ) {
						setState( next );
					} else {
						setPresent( false ); // getPosts found no post → deleted/unindexed
					}
				} )
				.catch( () => {
					/* counts are best-effort; fail open — the action buttons still work */
				} );
		} else {
			fetchPostExists( postUri )
				.then( ( exists ) => ! cancelled && exists === false && setPresent( false ) )
				.catch( () => {} );
		}
		return () => {
			cancelled = true;
		};
	}, [ status, agent, postUri ] );

	const refresh = () => {
		if ( agent ) {
			fetchPostState( agent, postUri )
				.then( ( next ) => mounted.current && next && setState( next ) )
				.catch( () => {} );
		}
	};

	const onToggleLike = async () => {
		if ( ! agent || ! did || busy ) {
			return;
		}
		setBusy( 'like' );
		setFlash( null );
		try {
			if ( state?.viewerLikeUri ) {
				await unlike( agent, did, state.viewerLikeUri );
			} else {
				await like( agent, did, subject );
			}
			refresh();
		} catch ( err ) {
			setFlash( { kind: 'error', message: errorText( err, 'Could not update your like.' ) } );
		} finally {
			setBusy( null );
		}
	};

	const onToggleRepost = async () => {
		if ( ! agent || ! did || busy ) {
			return;
		}
		setBusy( 'repost' );
		setFlash( null );
		try {
			if ( state?.viewerRepostUri ) {
				await unrepost( agent, did, state.viewerRepostUri );
			} else {
				await repost( agent, did, subject );
			}
			refresh();
		} catch ( err ) {
			setFlash( { kind: 'error', message: errorText( err, 'Could not update your repost.' ) } );
		} finally {
			setBusy( null );
		}
	};

	const openComposer = ( mode: Composer ) => {
		setComposer( mode );
		setText( '' );
		setFlash( null );
	};

	const onSubmitComposer = async () => {
		if ( ! agent || ! did || ! composer || submitting ) {
			return;
		}
		if ( ! validateReplyText( text, { allowEmpty: composer === 'quote' } ).ok ) {
			return;
		}
		setSubmitting( true );
		try {
			const action = composer === 'reply' ? postReply : postQuote;
			const uri = await action( agent, did, { text, subject } );
			setComposer( null );
			setText( '' );
			setFlash( {
				kind: 'success',
				message: composer === 'reply' ? 'Reply posted to Bluesky.' : 'Quote posted to Bluesky.',
				href: bskyPostWebUrl( uri ),
			} );
			refresh();
		} catch ( err ) {
			setFlash( { kind: 'error', message: errorText( err, 'Could not post to Bluesky.' ) } );
		} finally {
			setSubmitting( false );
		}
	};

	if ( status === 'loading' ) {
		return <div className="post-actions post-actions--loading">Loading actions…</div>;
	}

	// The companion post is gone — there's no live Bluesky thread to act on, so render
	// nothing rather than buttons / a sign-in prompt / a dead thread link that won't work.
	if ( ! present ) {
		return null;
	}

	const threadUrl = bskyPostWebUrl( postUri );

	// Signed-out: prompt sign-in (same OAuth flow as the editor) before any action.
	if ( status !== 'signed-in' || ! agent || ! did ) {
		return (
			<div className="post-actions">
				<p className="post-actions__note">
					Sign in with your AT Protocol account to like, repost, or reply. Actions are
					public and happen on Bluesky.
				</p>
				<form
					className="post-actions__signin"
					onSubmit={ ( event ) => {
						event.preventDefault();
						void signIn( handle );
					} }
				>
					<input
						className="post-actions__signin-input"
						aria-label="Your handle, DID, or PDS URL"
						autoComplete="username"
						autoCapitalize="none"
						autoCorrect="off"
						spellCheck={ false }
						placeholder="alice.bsky.social"
						value={ handle }
						onChange={ ( event ) => setHandle( event.target.value ) }
					/>
					<button className="post-actions__signin-btn" type="submit">
						Sign in to react
					</button>
				</form>
				{ authError && (
					<p className="post-actions__error" role="alert">
						{ authError }
					</p>
				) }
				<a className="post-actions__thread" href={ threadUrl } target="_blank" rel="noopener noreferrer">
					View this post on Bluesky
				</a>
			</div>
		);
	}

	const liked = Boolean( state?.viewerLikeUri );
	const reposted = Boolean( state?.viewerRepostUri );
	// A quote can be posted with no commentary (bare quote-repost); a reply cannot.
	const validity = validateReplyText( text, { allowEmpty: composer === 'quote' } );
	const graphemes = graphemeLength( text );

	return (
		<div className="post-actions">
			<div className="post-actions__bar" role="group" aria-label="Post actions">
				<button
					type="button"
					className={ `post-actions__btn${ liked ? ' is-active' : '' }` }
					aria-pressed={ liked }
					disabled={ busy === 'like' }
					onClick={ onToggleLike }
				>
					{ liked ? '♥' : '♡' } Like{ countLabel( state?.likeCount ) }
				</button>
				<button
					type="button"
					className={ `post-actions__btn${ reposted ? ' is-active' : '' }` }
					aria-pressed={ reposted }
					disabled={ busy === 'repost' }
					onClick={ onToggleRepost }
				>
					⇄ Repost{ countLabel( state?.repostCount ) }
				</button>
				<button type="button" className="post-actions__btn" onClick={ () => openComposer( 'quote' ) }>
					❝ Quote
				</button>
				<button type="button" className="post-actions__btn" onClick={ () => openComposer( 'reply' ) }>
					↩ Reply{ countLabel( state?.replyCount ) }
				</button>
			</div>

			{ composer && (
				<div className="post-actions__composer">
					<label className="post-actions__composer-label" htmlFor="post-actions-text">
						{ composer === 'reply' ? 'Your reply' : 'Add a comment to your quote' }
					</label>
					<textarea
						id="post-actions-text"
						className="post-actions__textarea"
						rows={ 4 }
						placeholder={ composer === 'reply' ? 'Write a reply…' : 'Optional comment…' }
						value={ text }
						onChange={ ( event ) => setText( event.target.value ) }
					/>
					<div className="post-actions__composer-foot">
						<span
							className={ `post-actions__count${
								graphemes > MAX_REPLY_GRAPHEMES ? ' is-over' : ''
							}` }
						>
							{ graphemes } / { MAX_REPLY_GRAPHEMES }
						</span>
						<div className="post-actions__composer-btns">
							<button
								type="button"
								className="post-actions__btn"
								onClick={ () => setComposer( null ) }
								disabled={ submitting }
							>
								Cancel
							</button>
							<button
								type="button"
								className="post-actions__submit"
								onClick={ onSubmitComposer }
								disabled={ submitting || ! validity.ok }
							>
								{ submitting
									? 'Posting…'
									: composer === 'reply'
									? 'Post reply'
									: 'Post quote' }
							</button>
						</div>
					</div>
				</div>
			) }

			{ flash && (
				<p
					className={ `post-actions__flash post-actions__flash--${ flash.kind }` }
					role={ flash.kind === 'error' ? 'alert' : 'status' }
				>
					{ flash.message }{ ' ' }
					{ flash.href && (
						<a href={ flash.href } target="_blank" rel="noopener noreferrer">
							View on Bluesky
						</a>
					) }
				</p>
			) }

			<p className="post-actions__note">
				Likes, reposts, quotes, and replies are public and happen on Bluesky.
			</p>
			<a className="post-actions__thread" href={ threadUrl } target="_blank" rel="noopener noreferrer">
				View the full thread on Bluesky
			</a>
		</div>
	);
}

/** A `(n)` suffix for a button label, omitted when the count is zero/unknown. */
function countLabel( count: number | undefined ): string {
	return count && count > 0 ? ` (${ count })` : '';
}

function errorText( err: unknown, fallback: string ): string {
	const detail = err instanceof Error ? err.message : '';
	return detail ? `${ fallback } ${ detail }` : fallback;
}

export default function PostActions( props: PostActionsProps ) {
	return (
		<AuthProvider>
			<ActionsGate { ...props } />
		</AuthProvider>
	);
}
