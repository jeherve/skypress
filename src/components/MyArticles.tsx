import { useEffect, useState } from 'react';
import type { Agent } from '@atproto/api';
import { listAllMyArticles, unpublish, type MyArticle } from '../lib/publish/publisher';

interface Props {
	agent: Agent;
	did: string;
	/** Bump to re-fetch after a publish/update. */
	refreshKey: number;
	onEdit: ( article: MyArticle ) => void;
}

/** Lists the signed-in writer's SkyPress articles across all their publications (SP5/SP10). */
export default function MyArticles( { agent, did, refreshKey, onEdit }: Props ) {
	const [ articles, setArticles ] = useState< MyArticle[] | null >( null );
	const [ busy, setBusy ] = useState< string | null >( null );

	useEffect( () => {
		let cancelled = false;
		listAllMyArticles( agent, did )
			.then( ( list ) => ! cancelled && setArticles( list ) )
			.catch( () => ! cancelled && setArticles( [] ) );
		return () => {
			cancelled = true;
		};
	}, [ agent, did, refreshKey ] );

	async function onDelete( article: MyArticle ) {
		const ok = window.confirm(
			`Unpublish “${ article.title }”?\n\nThis deletes the article AND its Bluesky post.`
		);
		if ( ! ok ) {
			return;
		}
		setBusy( article.rkey );
		try {
			await unpublish( agent, did, {
				rkey: article.rkey,
				bskyPostRef: article.bskyPostRef,
			} );
			setArticles( ( prev ) => prev?.filter( ( a ) => a.rkey !== article.rkey ) ?? null );
		} finally {
			setBusy( null );
		}
	}

	if ( articles === null ) {
		return <p className="myarticles__loading">Loading your articles…</p>;
	}
	if ( articles.length === 0 ) {
		return null;
	}

	return (
		<section className="myarticles" aria-label="Your articles">
			<h2 className="myarticles__heading">Your articles</h2>
			<ul className="myarticles__list">
				{ articles.map( ( article ) => (
					<li className="myarticles__item" key={ article.rkey }>
						<span className="myarticles__title">
							{ article.title }
							<em className="myarticles__pub"> · { article.siteSlug }</em>
							{ article.updatedAt && <em className="myarticles__edited"> · edited</em> }
						</span>
						<span className="myarticles__actions">
							<button type="button" onClick={ () => onEdit( article ) }>
								Edit
							</button>
							<button
								type="button"
								disabled={ busy === article.rkey }
								onClick={ () => void onDelete( article ) }
							>
								{ busy === article.rkey ? 'Unpublishing…' : 'Unpublish' }
							</button>
						</span>
					</li>
				) ) }
			</ul>
		</section>
	);
}
