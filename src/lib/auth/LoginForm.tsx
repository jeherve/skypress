import { useState } from 'react';
import { useAuth } from './useAuth';

/** Handle/DID/PDS-URL entry that kicks off the OAuth redirect. */
export default function LoginForm() {
	const { signIn, error } = useAuth();
	const [ value, setValue ] = useState( '' );

	return (
		<form
			className="login"
			onSubmit={ ( event ) => {
				event.preventDefault();
				void signIn( value );
			} }
		>
			<h1 className="login__title">Sign in to write</h1>
			<p className="login__lede">
				Use your existing Bluesky / AT Protocol identity. Your work is saved to
				your own server.
			</p>
			<label className="login__label" htmlFor="handle">
				Your handle, DID, or PDS URL
			</label>
			<input
				id="handle"
				className="login__input"
				name="handle"
				autoComplete="username"
				autoCapitalize="none"
				autoCorrect="off"
				spellCheck={ false }
				placeholder="alice.bsky.social"
				value={ value }
				onChange={ ( event ) => setValue( event.target.value ) }
			/>
			<button className="login__submit" type="submit">
				Sign in with AT Protocol
			</button>
			{ error && (
				<p className="login__error" role="alert">
					{ error }
				</p>
			) }
			<p className="login__note">
				You'll be sent to your provider to authorize SkyPress, then returned here.
			</p>
		</form>
	);
}
