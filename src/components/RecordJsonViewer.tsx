import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface RecordJsonViewerProps {
	/** Sanitised, syntax-highlighted JSON markup — a `<code class="hljs language-json">…</code>` string. */
	highlightedHtml: string;
}

/**
 * A code-icon button at the end of the reader eyebrow that opens a modal showing the
 * post's raw PDS record (its `value`) as syntax-highlighted JSON. The markup is
 * highlighted + sanitised server-side and passed in as `highlightedHtml`; this island
 * owns only the open/close interaction. JS-only enhancement (mounted `client:only`).
 */
export default function RecordJsonViewer( { highlightedHtml }: RecordJsonViewerProps ) {
	const [ open, setOpen ] = useState( false );
	const triggerRef = useRef< HTMLButtonElement >( null );
	const closeRef = useRef< HTMLButtonElement >( null );

	function close() {
		setOpen( false );
		// Return focus to the trigger that opened the dialog.
		triggerRef.current?.focus();
	}

	// Move focus into the dialog on open, and close on Escape while it's open.
	useEffect( () => {
		if ( ! open ) {
			return;
		}
		closeRef.current?.focus();
		const onKey = ( event: KeyboardEvent ) => {
			if ( event.key === 'Escape' ) {
				close();
			}
		};
		document.addEventListener( 'keydown', onKey );
		return () => document.removeEventListener( 'keydown', onKey );
		// `close` is stable for the lifetime of the open dialog; only `open` matters here.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ open ] );

	return (
		<>
			<button
				ref={ triggerRef }
				type="button"
				className="record-json__trigger"
				aria-label="View record JSON"
				onClick={ () => setOpen( true ) }
			>
				<svg
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true"
				>
					<path d="m16 18 6-6-6-6" />
					<path d="m8 6-6 6 6 6" />
				</svg>
			</button>
			{ /* Portalled to <body>: the trigger lives inside the eyebrow <p>, where a
			   block-level backdrop would be invalid, and the fixed overlay must escape any
			   ancestor overflow/transform. Focus is moved in on open and restored to the
			   trigger on close; we intentionally don't trap Tab — the dialog is view-only
			   (one focusable control), and Escape/backdrop both dismiss it. */ }
			{ open &&
				createPortal(
					<div className="record-json__backdrop" onClick={ close }>
						<div
							className="record-json__dialog"
							role="dialog"
							aria-modal="true"
							aria-label="Record JSON"
							onClick={ ( event ) => event.stopPropagation() }
						>
							<button
								ref={ closeRef }
								type="button"
								className="record-json__close"
								aria-label="Close"
								onClick={ close }
							>
								×
							</button>
							<pre
								className="record-json__code"
								dangerouslySetInnerHTML={ { __html: highlightedHtml } }
							/>
						</div>
					</div>,
					document.body
				) }
		</>
	);
}
