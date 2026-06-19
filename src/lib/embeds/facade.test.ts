// src/lib/embeds/facade.test.ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { activatePlay } from './facade';

beforeEach( () => {
	document.body.innerHTML = '';
} );

function facade( provider: string, id: string ): HTMLButtonElement {
	const fig = document.createElement( 'figure' );
	fig.className = 'wp-block-embed skypress-embed skypress-embed--video';
	const btn = document.createElement( 'button' );
	btn.className = 'skypress-embed__play';
	btn.dataset.embedProvider = provider;
	btn.dataset.embedId = id;
	fig.appendChild( btn );
	document.body.appendChild( fig );
	return btn;
}

describe( 'activatePlay', () => {
	it( 'replaces the button with a trusted youtube iframe', () => {
		const btn = facade( 'youtube', 'dQw4w9WgXcQ' );
		activatePlay( btn );
		const iframe = document.querySelector( 'iframe' );
		expect( iframe ).not.toBeNull();
		expect( iframe!.getAttribute( 'src' ) ).toBe(
			'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1'
		);
		expect( document.querySelector( 'button' ) ).toBeNull();
	} );

	it( 'does nothing for an unknown provider (never builds an iframe)', () => {
		const btn = facade( 'evil', 'x' );
		activatePlay( btn );
		expect( document.querySelector( 'iframe' ) ).toBeNull();
	} );
} );
