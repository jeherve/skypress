import { useEffect, useState } from 'react';
import type { Agent } from '@atproto/api';
import { AuthProvider } from '../lib/auth/AuthProvider';
import { useAuth } from '../lib/auth/useAuth';
import LoginForm from '../lib/auth/LoginForm';
import PublicationForm from './PublicationForm';
import {
	listAllPublications,
	deletePublication,
	type Publication,
	type ForeignPublication,
} from '../lib/publish/publications';
import {
	listPublicationArticles,
	unpublish,
	type MyArticle,
} from '../lib/publish/publisher';
import { buildGetBlobUrl, type BlobRefJson } from '../lib/media/blob';

type View =
	| { kind: 'list' }
	| { kind: 'create' }
	| { kind: 'manage'; pub: Publication };

/** The publication dashboard (SP10, step D). Authed, client-only — no `@wordpress/*`. */
function DashboardGate() {
	const { status, agent, handle, did, pdsUrl, error, signOut } = useAuth();
	const [ data, setData ] = useState<
		{ owned: Publication[]; foreign: ForeignPublication[] } | null
	>( null );
	const [ view, setView ] = useState< View >( { kind: 'list' } );

	useEffect( () => {
		if ( ! agent || ! did ) {
			return;
		}
		let cancelled = false;
		listAllPublications( agent, did )
			.then( ( result ) => ! cancelled && setData( result ) )
			.catch( () => ! cancelled && setData( { owned: [], foreign: [] } ) );
		return () => {
			cancelled = true;
		};
	}, [ agent, did ] );

	if ( status === 'loading' ) {
		return <p className="dash__loading">Connecting to your identity…</p>;
	}

	if ( status !== 'signed-in' || ! agent || ! did ) {
		return (
			<div className="dash__login">
				<LoginForm />
				{ status === 'error' && error && (
					<p className="dash__error" role="alert">
						Couldn't start the auth client: { error }
					</p>
				) }
			</div>
		);
	}

	const writerHandle = handle ?? did;

	const reload = () => {
		listAllPublications( agent, did )
			.then( setData )
			.catch( () => setData( { owned: [], foreign: [] } ) );
	};

	return (
		<div className="dash">
			<header className="dash__bar">
				<button
					type="button"
					className="dash__crumb"
					onClick={ () => setView( { kind: 'list' } ) }
					disabled={ view.kind === 'list' }
				>
					Your publications
				</button>
				<span className="dash__bar-actions">
					<a className="dash__studio" href="/editor">
						Studio
					</a>
					<button type="button" className="dash__signout" onClick={ () => void signOut() }>
						Sign out
					</button>
				</span>
			</header>

			{ view.kind === 'create' && (
				<PublicationForm
					agent={ agent }
					did={ did }
					pdsUrl={ pdsUrl }
					handle={ writerHandle }
					onSaved={ () => {
						reload();
						setView( { kind: 'list' } );
					} }
					onCancel={ () => setView( { kind: 'list' } ) }
				/>
			) }

			{ view.kind === 'manage' && (
				<PublicationManager
					agent={ agent }
					did={ did }
					pdsUrl={ pdsUrl }
					handle={ writerHandle }
					pub={ view.pub }
					onChanged={ ( pub ) => {
						reload();
						setView( { kind: 'manage', pub } );
					} }
					onDeleted={ () => {
						reload();
						setView( { kind: 'list' } );
					} }
					onBack={ () => setView( { kind: 'list' } ) }
				/>
			) }

			{ view.kind === 'list' && (
				<PublicationList
					publications={ data ? data.owned : null }
					foreign={ data?.foreign ?? [] }
					did={ did }
					handle={ writerHandle }
					pdsUrl={ pdsUrl }
					onNew={ () => setView( { kind: 'create' } ) }
					onManage={ ( pub ) => setView( { kind: 'manage', pub } ) }
				/>
			) }
		</div>
	);
}

/** A publication's 48px logo, or a letter-fallback square when it has no icon. Shared by the owned and foreign lists. */
function PublicationLogo( {
	icon,
	name,
	pdsUrl,
	did,
}: {
	icon?: BlobRefJson;
	name: string;
	pdsUrl: string | null;
	did: string;
} ) {
	const logoUrl = icon && pdsUrl ? buildGetBlobUrl( pdsUrl, did, icon.ref.$link ) : null;
	return logoUrl ? (
		<img className="dash__publogo" src={ logoUrl } alt="" width={ 48 } height={ 48 } />
	) : (
		<span className="dash__publogo dash__publogo--fallback" aria-hidden="true">
			{ name.charAt( 0 ).toUpperCase() }
		</span>
	);
}

function PublicationList( {
	publications,
	foreign,
	did,
	handle,
	pdsUrl,
	onNew,
	onManage,
}: {
	publications: Publication[] | null;
	foreign: ForeignPublication[];
	did: string;
	handle: string;
	pdsUrl: string | null;
	onNew: () => void;
	onManage: ( pub: Publication ) => void;
} ) {
	if ( publications === null ) {
		return <p className="dash__loading">Loading your publications…</p>;
	}
	return (
		<section className="dash__section">
			<div className="dash__section-head">
				<h1 className="dash__h1">Your publications</h1>
				<button type="button" className="dash__new" onClick={ onNew }>
					+ New publication
				</button>
			</div>

			{ publications.length === 0 ? (
				<p className="dash__empty">
					You don't have any publications yet. Create one to start publishing.
				</p>
			) : (
				<ul className="dash__pubs">
					{ publications.map( ( pub ) => {
						return (
							<li className="dash__pub" key={ pub.uri }>
								<PublicationLogo
									icon={ pub.icon }
									name={ pub.name }
									pdsUrl={ pdsUrl }
									did={ did }
								/>
								<span className="dash__pubtext">
									<span className="dash__pubname">{ pub.name }</span>
									<span className="dash__pubslug">/{ pub.slug }</span>
								</span>
								<span className="dash__pubactions">
									<a className="dash__link" href={ `/@${ handle }/${ pub.slug }` }>
										View
									</a>
									<button type="button" onClick={ () => onManage( pub ) }>
										Manage
									</button>
								</span>
							</li>
						);
					} ) }
				</ul>
			) }

			{ foreign.length > 0 && (
				<div className="dash__foreign">
					<h2 className="dash__h2">From other apps</h2>
					<p className="dash__foreign-note">
						These publications live in your repository but are managed by another app.
					</p>
					<ul className="dash__pubs">
						{ foreign.map( ( pub ) => {
							return (
								<li className="dash__pub" key={ pub.uri }>
									<PublicationLogo
										icon={ pub.icon }
										name={ pub.name }
										pdsUrl={ pdsUrl }
										did={ did }
									/>
									<span className="dash__pubtext">
										<span className="dash__pubname">{ pub.name }</span>
										<span className="dash__pubhost">{ pub.hostname }</span>
									</span>
									<span className="dash__pubactions">
										<a
											className="dash__link"
											href={ pub.url }
											target="_blank"
											rel="noopener noreferrer"
										>
											Visit ↗
										</a>
									</span>
								</li>
							);
						} ) }
					</ul>
				</div>
			) }
		</section>
	);
}

type Tab = 'posts' | 'settings' | 'delete';

function PublicationManager( {
	agent,
	did,
	pdsUrl,
	handle,
	pub,
	onChanged,
	onDeleted,
	onBack,
}: {
	agent: Agent;
	did: string;
	pdsUrl: string | null;
	handle: string;
	pub: Publication;
	onChanged: ( pub: Publication ) => void;
	onDeleted: () => void;
	onBack: () => void;
} ) {
	const [ tab, setTab ] = useState< Tab >( 'posts' );
	const [ articles, setArticles ] = useState< MyArticle[] | null >( null );
	const [ busy, setBusy ] = useState< string | null >( null );
	const [ deleting, setDeleting ] = useState( false );
	const [ error, setError ] = useState< string | null >( null );

	useEffect( () => {
		let cancelled = false;
		listPublicationArticles( agent, did, { uri: pub.uri, slug: pub.slug } )
			.then( ( list ) => ! cancelled && setArticles( list ) )
			.catch( () => ! cancelled && setArticles( [] ) );
		return () => {
			cancelled = true;
		};
	}, [ agent, did, pub.uri, pub.slug ] );

	async function onUnpublish( article: MyArticle ) {
		const ok = window.confirm(
			`Unpublish “${ article.title }”?\n\nThis deletes the article AND its Bluesky post.`
		);
		if ( ! ok ) {
			return;
		}
		setBusy( article.rkey );
		setError( null );
		try {
			await unpublish( agent, did, { rkey: article.rkey, bskyPostRef: article.bskyPostRef } );
			setArticles( ( prev ) => prev?.filter( ( a ) => a.rkey !== article.rkey ) ?? null );
		} catch ( err ) {
			setError( err instanceof Error ? err.message : String( err ) );
		} finally {
			setBusy( null );
		}
	}

	async function onDelete() {
		const count = articles?.length ?? 0;
		const ok = window.confirm(
			`Delete the publication “${ pub.name }”?\n\n` +
				`This permanently removes the publication and its ${ count } article${
					count === 1 ? '' : 's'
				} — and each article's companion Bluesky post. This cannot be undone.`
		);
		if ( ! ok ) {
			return;
		}
		setDeleting( true );
		setError( null );
		try {
			await deletePublication( agent, did, { uri: pub.uri, rkey: pub.rkey } );
			onDeleted();
		} catch ( err ) {
			setError(
				`${ err instanceof Error ? err.message : String( err ) } — some articles or ` +
					`posts may already have been removed. Reopen this publication and try again.`
			);
			setDeleting( false );
		}
	}

	return (
		<section className="dash__section">
			<div className="dash__section-head">
				<h1 className="dash__h1">{ pub.name }</h1>
				<a className="dash__link" href={ `/@${ handle }/${ pub.slug }` }>
					View public page
				</a>
			</div>

			<nav className="dash__tabs">
				<button
					type="button"
					className={ tab === 'posts' ? 'is-active' : '' }
					onClick={ () => setTab( 'posts' ) }
				>
					Posts
				</button>
				<button
					type="button"
					className={ tab === 'settings' ? 'is-active' : '' }
					onClick={ () => setTab( 'settings' ) }
				>
					Settings
				</button>
				<button
					type="button"
					className={ tab === 'delete' ? 'is-active' : '' }
					onClick={ () => setTab( 'delete' ) }
				>
					Delete
				</button>
			</nav>

			{ error && (
				<p className="dash__error" role="alert">
					{ error }
				</p>
			) }

			{ tab === 'posts' && (
				<div className="dash__posts">
					{ articles === null ? (
						<p className="dash__loading">Loading posts…</p>
					) : articles.length === 0 ? (
						<p className="dash__empty">
							No posts yet. <a href="/editor">Open the studio</a> to write one.
						</p>
					) : (
						<ul className="dash__postlist">
							{ articles.map( ( article ) => (
								<li className="dash__post" key={ article.rkey }>
									<a
										className="dash__postlink"
										href={ `/@${ handle }/${ pub.slug }/${ article.rkey }` }
									>
										{ article.title }
									</a>
									{ article.publishedAt && (
										<span className="dash__postdate">
											{ article.publishedAt.slice( 0, 10 ) }
										</span>
									) }
									<button
										type="button"
										disabled={ busy === article.rkey }
										onClick={ () => void onUnpublish( article ) }
									>
										{ busy === article.rkey ? 'Unpublishing…' : 'Unpublish' }
									</button>
								</li>
							) ) }
						</ul>
					) }
				</div>
			) }

			{ tab === 'settings' && (
				<PublicationForm
					agent={ agent }
					did={ did }
					pdsUrl={ pdsUrl }
					handle={ handle }
					existing={ pub }
					onSaved={ onChanged }
					onCancel={ onBack }
				/>
			) }

			{ tab === 'delete' && (
				<div className="dash__danger">
					<h2>Delete this publication</h2>
					<p>
						This permanently removes <strong>{ pub.name }</strong>, all of its articles, and
						each article's companion Bluesky post. This cannot be undone.
					</p>
					<button
						type="button"
						className="dash__delete"
						onClick={ () => void onDelete() }
						disabled={ deleting }
					>
						{ deleting ? 'Deleting…' : 'Delete publication' }
					</button>
				</div>
			) }
		</section>
	);
}

export default function Dashboard() {
	return (
		<AuthProvider>
			<DashboardGate />
		</AuthProvider>
	);
}
