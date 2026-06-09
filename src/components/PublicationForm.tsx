import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import type { Agent } from '@atproto/api';
import {
	createPublication,
	updatePublication,
	type Publication,
} from '../lib/publish/publications';
import {
	uploadImageBlob,
	ImageValidationError,
	PUBLICATION_ICON_MAX_BYTES,
} from '../lib/media/uploadImage';
import { buildGetBlobUrl, type BlobRefJson } from '../lib/media/blob';
import {
	THEME_PRESETS,
	findPresetByColors,
	resolveSelectedTheme,
	CUSTOM_THEME_SLUG,
	type Rgb,
} from '../lib/publish/themes';

interface Props {
	agent: Agent;
	did: string;
	/** Needed to preview an already-stored logo via getBlob; may be null if unresolved. */
	pdsUrl: string | null;
	handle: string;
	/** When set, the form edits this publication (slug stays frozen). Otherwise it creates one. */
	existing?: Publication;
	onSaved: ( pub: Publication ) => void;
	onCancel: () => void;
}

const ICON_LIMIT_MB = Math.round( ( PUBLICATION_ICON_MAX_BYTES / 1_000_000 ) * 100 ) / 100;

/**
 * Create / edit a publication (SP10, step E): name (required), logo (optional, ≤1MB image),
 * description (optional). The slug is auto-derived and never shown as an input. On edit the
 * slug is frozen — a rename never changes the URL.
 */
export default function PublicationForm( {
	agent,
	did,
	pdsUrl,
	handle,
	existing,
	onSaved,
	onCancel,
}: Props ) {
	const [ name, setName ] = useState( existing?.name ?? '' );
	const [ description, setDescription ] = useState( existing?.description ?? '' );
	const [ icon, setIcon ] = useState< BlobRefJson | null >( existing?.icon ?? null );
	const [ iconPreview, setIconPreview ] = useState< string | null >(
		existing?.icon && pdsUrl
			? buildGetBlobUrl( pdsUrl, did, existing.icon.ref.$link )
			: null
	);
	// A stored theme that matches no current preset (e.g. a preset whose colours later changed):
	// keep it verbatim and offer it as a selectable "Custom" option, so editing an unrelated field
	// never silently erases the publisher's colours.
	const customTheme =
		existing?.basicTheme && ! findPresetByColors( existing.basicTheme )
			? existing.basicTheme
			: null;
	const [ themeSlug, setThemeSlug ] = useState< string | null >( () => {
		const matched = findPresetByColors( existing?.basicTheme )?.slug;
		if ( matched ) {
			return matched;
		}
		return customTheme ? CUSTOM_THEME_SLUG : null;
	} );
	const [ uploading, setUploading ] = useState( false );
	const [ saving, setSaving ] = useState( false );
	const [ error, setError ] = useState< string | null >( null );
	// Track any object URL we minted for the preview so we can revoke it (avoid a blob leak).
	const objectUrlRef = useRef< string | null >( null );

	useEffect(
		() => () => {
			if ( objectUrlRef.current ) {
				URL.revokeObjectURL( objectUrlRef.current );
			}
		},
		[]
	);

	const isEditing = Boolean( existing );

	async function onPickFile( event: ChangeEvent< HTMLInputElement > ) {
		const file = event.target.files?.[ 0 ];
		if ( ! file ) {
			return;
		}
		setError( null );
		setUploading( true );
		try {
			const ref = await uploadImageBlob( agent, file );
			setIcon( ref );
			// Preview from a local object URL — instant, and avoids a getBlob round-trip lag.
			// Revoke any previous one first so re-picking doesn't leak blob URLs.
			if ( objectUrlRef.current ) {
				URL.revokeObjectURL( objectUrlRef.current );
			}
			objectUrlRef.current = URL.createObjectURL( file );
			setIconPreview( objectUrlRef.current );
		} catch ( err ) {
			setError(
				err instanceof ImageValidationError || err instanceof Error
					? err.message
					: String( err )
			);
		} finally {
			setUploading( false );
		}
	}

	async function onSubmit( event: FormEvent ) {
		event.preventDefault();
		if ( ! name.trim() ) {
			setError( 'Give your publication a name.' );
			return;
		}
		setSaving( true );
		setError( null );
		try {
			const input = {
				name: name.trim(),
				description: description.trim() || undefined,
				icon: icon ?? undefined,
				basicTheme: resolveSelectedTheme( themeSlug, customTheme ),
			};
			const saved = existing
				? await updatePublication( agent, did, handle, existing, input )
				: await createPublication( agent, did, handle, input );
			// Clear `saving` before handing off: the Settings tab keeps this form mounted across a
			// save (onSaved just re-renders the manager on the same tab), so relying on unmount left
			// the button stuck on "Saving…" forever despite a successful write.
			setSaving( false );
			onSaved( saved );
		} catch ( err ) {
			setError( err instanceof Error ? err.message : String( err ) );
			setSaving( false );
		}
	}

	return (
		<form className="pubform" onSubmit={ onSubmit }>
			<h2 className="pubform__title">
				{ isEditing ? 'Publication settings' : 'New publication' }
			</h2>

			<div className="pubform__logo-row">
				{ iconPreview ? (
					<img className="pubform__logo" src={ iconPreview } alt="" width={ 72 } height={ 72 } />
				) : (
					<span className="pubform__logo pubform__logo--fallback" aria-hidden="true">
						{ ( name.trim().charAt( 0 ) || '✦' ).toUpperCase() }
					</span>
				) }
				<label className="pubform__logo-label">
					<span>Logo</span>
					<input
						type="file"
						accept="image/*"
						onChange={ ( event ) => void onPickFile( event ) }
						disabled={ uploading || saving }
					/>
					<small>Optional · square image · {ICON_LIMIT_MB}MB max</small>
					{ uploading && <small>Uploading…</small> }
				</label>
			</div>

			<label className="pubform__field">
				<span>Name</span>
				<input
					type="text"
					value={ name }
					onChange={ ( event ) => setName( event.target.value ) }
					placeholder="My Publication"
					maxLength={ 128 }
					disabled={ saving }
					required
				/>
			</label>

			<label className="pubform__field">
				<span>Description</span>
				<textarea
					value={ description }
					onChange={ ( event ) => setDescription( event.target.value ) }
					placeholder="What this publication is about (optional)."
					maxLength={ 300 }
					rows={ 3 }
					disabled={ saving }
				/>
			</label>

			<fieldset className="pubform__themes" role="radiogroup" aria-label="Theme">
				<legend>Theme</legend>
				<div className="pubform__theme-grid">
					<label className={ `pubform__theme${ themeSlug === null ? ' is-selected' : '' }` }>
						<input
							type="radio"
							name="pub-theme"
							value=""
							checked={ themeSlug === null }
							onChange={ () => setThemeSlug( null ) }
							disabled={ saving }
						/>
						<span
							className="pubform__theme-swatch pubform__theme-swatch--none"
							aria-hidden="true"
						/>
						<span className="pubform__theme-label">No theme</span>
					</label>
					{ customTheme && (
						<label
							className={ `pubform__theme${
								themeSlug === CUSTOM_THEME_SLUG ? ' is-selected' : ''
							}` }
						>
							<input
								type="radio"
								name="pub-theme"
								value={ CUSTOM_THEME_SLUG }
								checked={ themeSlug === CUSTOM_THEME_SLUG }
								onChange={ () => setThemeSlug( CUSTOM_THEME_SLUG ) }
								disabled={ saving }
							/>
							<span
								className="pubform__theme-swatch"
								style={ {
									background: `rgb(${ customTheme.background.r }, ${ customTheme.background.g }, ${ customTheme.background.b })`,
									color: `rgb(${ customTheme.foreground.r }, ${ customTheme.foreground.g }, ${ customTheme.foreground.b })`,
								} }
								aria-hidden="true"
							>
								<span
									className="pubform__theme-dot"
									style={ {
										background: `rgb(${ customTheme.accent.r }, ${ customTheme.accent.g }, ${ customTheme.accent.b })`,
									} }
								/>
								Aa
							</span>
							<span className="pubform__theme-label">Current</span>
						</label>
					) }
					{ THEME_PRESETS.map( ( preset ) => {
						const swatch = ( color: Rgb ) => `rgb(${ color.r }, ${ color.g }, ${ color.b })`;
						return (
							<label
								key={ preset.slug }
								className={ `pubform__theme${
									themeSlug === preset.slug ? ' is-selected' : ''
								}` }
							>
								<input
									type="radio"
									name="pub-theme"
									value={ preset.slug }
									checked={ themeSlug === preset.slug }
									onChange={ () => setThemeSlug( preset.slug ) }
									disabled={ saving }
								/>
								<span
									className="pubform__theme-swatch"
									style={ {
										background: swatch( preset.colors.background ),
										color: swatch( preset.colors.foreground ),
									} }
									aria-hidden="true"
								>
									<span
										className="pubform__theme-dot"
										style={ { background: swatch( preset.colors.accent ) } }
									/>
									Aa
								</span>
								<span className="pubform__theme-label">{ preset.label }</span>
							</label>
						);
					} ) }
				</div>
				<small>Sets the colours readers see on your publication.</small>
			</fieldset>

			{ isEditing && (
				<p className="pubform__note">
					The URL (<code>/{ existing!.slug }</code>) stays the same when you rename — links
					never break.
				</p>
			) }

			{ error && (
				<p className="pubform__error" role="alert">
					{ error }
				</p>
			) }

			<div className="pubform__actions">
				<button className="pubform__save" type="submit" disabled={ saving || uploading }>
					{ saving ? 'Saving…' : isEditing ? 'Save changes' : 'Create publication' }
				</button>
				<button
					className="pubform__cancel"
					type="button"
					onClick={ onCancel }
					disabled={ saving }
				>
					Cancel
				</button>
			</div>
		</form>
	);
}
