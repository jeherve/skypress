import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { CoverUpload } from '../lib/media/cover';
import CoverImagePicker from './CoverImagePicker';

( globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean } ).IS_REACT_ACT_ENVIRONMENT = true;

function mount( props: {
	cover: CoverUpload | null;
	onUpload: ( file: File ) => Promise< CoverUpload >;
	onChange: ( cover: CoverUpload | null ) => void;
} ) {
	const container = document.createElement( 'div' );
	document.body.appendChild( container );
	const root = createRoot( container );
	act( () => {
		root.render( createElement( CoverImagePicker, props ) );
	} );
	return {
		container,
		cleanup: () => {
			root.unmount();
			container.remove();
		},
	};
}

function setFiles( input: HTMLInputElement, files: File[] ) {
	Object.defineProperty( input, 'files', { value: files, configurable: true } );
	input.dispatchEvent( new Event( 'change', { bubbles: true } ) );
}

const onUpload = vi.fn< ( file: File ) => Promise< CoverUpload > >();
const onChange = vi.fn();

beforeEach( () => {
	onUpload.mockReset();
	onChange.mockReset();
} );

describe( 'CoverImagePicker', () => {
	it( 'shows the empty state with the fallback hint and the 1 MB cap', () => {
		const { container, cleanup } = mount( { cover: null, onUpload, onChange } );
		expect( container.textContent ).toMatch( /first image in your article/i );
		expect( container.textContent ).toMatch( /1 MB/i );
		cleanup();
	} );

	it( 'renders a preview and a Remove control when a cover is set', () => {
		const cover: CoverUpload = {
			ref: { $type: 'blob', ref: { $link: 'bafyc' }, mimeType: 'image/png', size: 10 },
			previewUrl: 'data:image/png;base64,AAA',
		};
		const { container, cleanup } = mount( { cover, onUpload, onChange } );
		const img = container.querySelector( 'img' )!;
		expect( img.getAttribute( 'src' ) ).toBe( 'data:image/png;base64,AAA' );
		const remove = Array.from( container.querySelectorAll( 'button' ) ).find(
			( b ) => b.textContent === 'Remove'
		)!;
		act( () => {
			remove.dispatchEvent( new MouseEvent( 'click', { bubbles: true } ) );
		} );
		expect( onChange ).toHaveBeenCalledWith( null );
		cleanup();
	} );

	it( 'rejects an oversize file inline without uploading', () => {
		const { container, cleanup } = mount( { cover: null, onUpload, onChange } );
		const input = container.querySelector( 'input[type="file"]' ) as HTMLInputElement;
		const big = new File( [ new Uint8Array( 1_000_001 ) ], 'big.png', { type: 'image/png' } );
		act( () => {
			setFiles( input, [ big ] );
		} );
		expect( container.textContent ).toMatch( /too large/i );
		expect( onUpload ).not.toHaveBeenCalled();
		cleanup();
	} );

	it( 'uploads a valid file and reports the result via onChange', async () => {
		const result: CoverUpload = {
			ref: { $type: 'blob', ref: { $link: 'bafynew' }, mimeType: 'image/png', size: 20 },
			previewUrl: 'data:image/png;base64,BBB',
		};
		onUpload.mockResolvedValue( result );
		const { container, cleanup } = mount( { cover: null, onUpload, onChange } );
		const input = container.querySelector( 'input[type="file"]' ) as HTMLInputElement;
		const ok = new File( [ 'x' ], 'ok.png', { type: 'image/png' } );
		await act( async () => {
			setFiles( input, [ ok ] );
		} );
		expect( onUpload ).toHaveBeenCalledTimes( 1 );
		expect( onChange ).toHaveBeenCalledWith( result );
		cleanup();
	} );
} );
