import { describe, expect, it } from 'vitest';
import { appBarNav } from './nav';

describe( 'appBarNav', () => {
	it( 'links the editor bar back to the dashboard (Publications)', () => {
		expect( appBarNav( 'editor' ) ).toEqual( {
			href: '/dashboard',
			label: 'Publications',
			icon: 'publications',
		} );
	} );

	it( 'links the dashboard bar into the editor (Write, feather)', () => {
		expect( appBarNav( 'dashboard' ) ).toEqual( {
			href: '/editor',
			label: 'Write',
			icon: 'feather',
		} );
	} );
} );
