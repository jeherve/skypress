// src/components/WriteStudio.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import type { BlockInstance } from '@wordpress/blocks';
import { AuthProvider } from '../lib/auth/AuthProvider';
import { useAuth } from '../lib/auth/useAuth';
import SkyEditor from './SkyEditor';
import AppBar from './AppBar';
import PublishedPill from './PublishedPill';
import CoverImagePicker from './CoverImagePicker';
import SignInPanel from './SignInPanel';
import WritePublishFlow from './WritePublishFlow';
import { createDeferredMediaUpload } from '../lib/write/deferred-media';
import { createDraftStore, type WriteDraft } from '../lib/write/draft-store';
import { listPublications, type Publication } from '../lib/publish/publications';
import { normalizeBlocks } from '../lib/publish/records';
import { validateCoverFile, type CoverUpload } from '../lib/media/cover';
import type { BlockNode } from '../lib/blocks/render';
import type { BlobRefJson } from '../lib/media/blob';

/** Read a file into a `data:` URL for a held (not-yet-uploaded) cover preview. */
function readAsDataUrl( file: File ): Promise< string > {
	return new Promise( ( resolve, reject ) => {
		const reader = new FileReader();
		reader.onload = () => resolve( reader.result as string );
		reader.onerror = () => reject( reader.error ?? new Error( 'Could not read the file.' ) );
		reader.readAsDataURL( file );
	} );
}

/** A placeholder ref for a held cover — only `previewUrl` (a data URL) is used before publish. */
function deferredCoverRef( file: File ): BlobRefJson {
	return { $type: 'blob', ref: { $link: '' }, mimeType: file.type, size: file.size };
}

function WriteSurface() {
	const { status, agent, did, handle, pdsUrl, error, signIn } = useAuth();

	const draftStore = useMemo( () => createDraftStore(), [] );
	const mediaUpload = useMemo( () => createDeferredMediaUpload(), [] );

	const [ title, setTitle ] = useState( '' );
	const [ lede, setLede ] = useState( '' );
	const [ blocks, setBlocks ] = useState< BlockNode[] >( [] );
	const [ cover, setCover ] = useState< CoverUpload | null >( null );
	const [ publications, setPublications ] = useState< Publication[] | null >( null );
	const [ flowOpen, setFlowOpen ] = useState( false );
	const [ signinOpen, setSigninOpen ] = useState( false );
	const [ published, setPublished ] = useState< { url: string } | null >( null );
	const [ editorKey, setEditorKey ] = useState( 0 );

	// Restored content fed to the editor canvas once, captured so a later `blocks`
	// change can't remount SkyEditor (which would wipe the canvas).
	const initialBlocksRef = useRef< BlockNode[] >( [] );
	const intentRef = useRef( false );

	// One-shot restore + intent read on mount.
	useEffect( () => {
		let cancelled = false;
		intentRef.current = draftStore.consumePublishIntent();
		draftStore.load().then( ( d: WriteDraft | null ) => {
			if ( cancelled || ! d ) {
				return;
			}
			initialBlocksRef.current = d.blocks;
			setTitle( d.title );
			setLede( d.lede );
			setBlocks( d.blocks );
			if ( d.coverDataUrl ) {
				setCover( {
					ref: { $type: 'blob', ref: { $link: '' }, mimeType: '', size: 0 },
					previewUrl: d.coverDataUrl,
				} );
			}
			setEditorKey( ( k ) => k + 1 );
		} );
		return () => {
			cancelled = true;
		};
	}, [ draftStore ] );

	// Load publications once signed in.
	useEffect( () => {
		if ( ! agent || ! did ) {
			return;
		}
		let cancelled = false;
		listPublications( agent, did )
			.then( ( list ) => ! cancelled && setPublications( list ) )
			.catch( () => ! cancelled && setPublications( [] ) );
		return () => {
			cancelled = true;
		};
	}, [ agent, did ] );

	// Resume: a publish intent + a signed-in session auto-opens the publish flow.
	useEffect( () => {
		if ( status === 'signed-in' && intentRef.current ) {
			intentRef.current = false;
			setFlowOpen( true );
		}
	}, [ status ] );

	const reloadPublications = () => {
		if ( agent && did ) {
			listPublications( agent, did )
				.then( setPublications )
				.catch( () => setPublications( [] ) );
		}
	};

	async function persistDraft() {
		await draftStore.save( {
			title,
			lede,
			blocks,
			coverDataUrl: cover?.previewUrl ?? null,
		} );
	}

	async function onSignIn( value: string ) {
		// Sign-in is only ever reached via Publish, so always stamp the intent that
		// auto-resumes the publish flow when the OAuth redirect returns.
		await persistDraft();
		draftStore.setPublishIntent();
		await signIn( value ); // full-page redirect; never resolves
	}

	function onPublishClicked() {
		if ( status === 'signed-in' ) {
			void persistDraft();
			setFlowOpen( true );
			return;
		}
		// Signed out → reveal the sign-in panel framed around publishing. Signing in is
		// only offered here, on the way to publishing — never as standalone chrome.
		setSigninOpen( true );
	}

	async function uploadCover( file: File ): Promise< CoverUpload > {
		const message = validateCoverFile( file );
		if ( message ) {
			throw new Error( message );
		}
		const previewUrl = await readAsDataUrl( file );
		return { ref: deferredCoverRef( file ), previewUrl };
	}

	const canPublish = title.trim().length > 0 && blocks.length > 0;
	const signedIn = status === 'signed-in' && agent && did;

	return (
		<>
			<AppBar current="editor" />

			{ /* The Publish action, right-aligned in the shared content column. The signed-in
			     identity + sign-out live in the app bar above, so there is no pill here — and
			     no standalone "Sign in" affordance (signing in happens on the way to publish).
			     Hidden once the publish stepper takes over, so the button isn't shown twice. */ }
			{ ! ( signedIn && flowOpen ) && (
				<div className="write-actions">
					<button
						type="button"
						className="write-publish"
						disabled={ ! canPublish }
						onClick={ onPublishClicked }
					>
						Publish…
					</button>
				</div>
			) }

			{ published && <PublishedPill url={ published.url } isEditing={ false } /> }

			{ ! signedIn && signinOpen && (
				<div className="write-signin">
					<SignInPanel
						forPublish
						error={ error }
						onSubmit={ ( value ) => void onSignIn( value ) }
						onCancel={ () => setSigninOpen( false ) }
					/>
				</div>
			) }

			{ signedIn && flowOpen && (
				<WritePublishFlow
					agent={ agent! }
					identity={ { did: did!, handle } }
					pdsUrl={ pdsUrl ?? '' }
					blocks={ blocks }
					coverDataUrl={ cover?.previewUrl ?? null }
					title={ title }
					description={ lede }
					publications={ publications }
					onReloadPublications={ reloadPublications }
					onPublished={ ( result ) => {
						setFlowOpen( false );
						setPublished( { url: result.articleUrl } );
						void draftStore.clear();
						// Reset to a fresh new article.
						setTitle( '' );
						setLede( '' );
						setBlocks( [] );
						setCover( null );
						initialBlocksRef.current = [];
						setEditorKey( ( k ) => k + 1 );
					} }
					onCancel={ () => setFlowOpen( false ) }
				/>
			) }

			<div key={ editorKey }>
				<textarea
					className="studio__title"
					rows={ 1 }
					placeholder="Add title"
					aria-label="Article title"
					value={ title }
					onKeyDown={ ( event ) => event.key === 'Enter' && event.preventDefault() }
					onChange={ ( event ) => {
						setPublished( null );
						setTitle( event.target.value );
					} }
				/>
				<textarea
					className="studio__lede"
					rows={ 1 }
					maxLength={ 3000 }
					placeholder="Add a subtitle…"
					aria-label="Subtitle"
					value={ lede }
					onChange={ ( event ) => setLede( event.target.value ) }
				/>
				<SkyEditor
					onChange={ ( instances: BlockInstance[] ) => setBlocks( normalizeBlocks( instances ) ) }
					mediaUpload={ mediaUpload }
					initialBlocks={ initialBlocksRef.current }
				/>
				<CoverImagePicker cover={ cover } onUpload={ uploadCover } onChange={ setCover } />
			</div>
		</>
	);
}

/** The writing-first island: editor for every auth status, publish deferred (design 2026-06-17). */
export default function WriteStudio() {
	return (
		<AuthProvider>
			<WriteSurface />
		</AuthProvider>
	);
}
