import { useState } from 'react';

import { ATMOSPHERE_WEB_BASE } from '../lib/social/atmosphere-url';

interface Props {
	/** True when opened from "Publish" — the copy promises a publish on return. */
	forPublish: boolean;
	error: string | null;
	onSubmit: ( value: string ) => void;
	onCancel?: () => void;
}

/**
 * Signed-out handle entry for the writing-first flow. OAuth is sign-in only, so this never
 * creates an account — it links out to Bluesky's hosted signup instead (brief guardrail). The
 * caller persists the draft + sets publish intent before the redirect.
 */
export default function SignInPanel( { forPublish, error, onSubmit, onCancel }: Props ) {
	const [ value, setValue ] = useState( '' );

	return (
		<form
			className="signin-panel"
			onSubmit={ ( event ) => {
				event.preventDefault();
				onSubmit( value.trim() );
			} }
		>
			<h2 className="signin-panel__title">
				{ forPublish ? 'Sign in to publish' : 'Sign in' }
			</h2>
			<p className="signin-panel__lede">
				{ forPublish
					? "Your draft is saved. Sign in and we'll pick up right where you left off and publish it."
					: 'Use your existing Bluesky / AT Protocol identity. Your work stays in your own account.' }
			</p>
			<label className="signin-panel__label" htmlFor="write-handle">
				Your handle, DID, or PDS URL
			</label>
			<input
				id="write-handle"
				className="signin-panel__input"
				name="handle"
				autoComplete="username"
				autoCapitalize="none"
				autoCorrect="off"
				spellCheck={ false }
				placeholder="alice.bsky.social"
				value={ value }
				onChange={ ( event ) => setValue( event.target.value ) }
			/>
			<div className="signin-panel__actions">
				<button className="signin-panel__submit" type="submit">
					Sign in with AT Protocol
				</button>
				{ onCancel && (
					<button className="signin-panel__cancel" type="button" onClick={ onCancel }>
						Cancel
					</button>
				) }
			</div>
			{ error && (
				<p className="signin-panel__error" role="alert">
					{ error }
				</p>
			) }
			<p className="signin-panel__signup">
				Need an account?{ ' ' }
				<a
					className="signin-panel__signup-link"
					href={ ATMOSPHERE_WEB_BASE }
					target="_blank"
					rel="noopener noreferrer"
					aria-label="Create an account on the ATmosphere (opens in a new tab)"
				>
					Create one on the ATmosphere
					{ /* Standard external-link glyph — same icon as the author page's Bluesky link. */ }
					<svg
						className="signin-panel__external"
						width="11"
						height="11"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.5"
						strokeLinecap="round"
						strokeLinejoin="round"
						aria-hidden="true"
					>
						<path d="M7 17 17 7" />
						<path d="M8 7h9v9" />
					</svg>
				</a>
			</p>
		</form>
	);
}
