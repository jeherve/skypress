import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Agent } from '@atproto/api';
import type { MyArticle } from '../lib/publish/publisher';

// React needs this flag to run effects synchronously inside act().
( globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean } ).IS_REACT_ACT_ENVIRONMENT = true;

const sampleArticle: MyArticle = {
	rkey: '3kabc123',
	title: 'Hello world',
	siteUri: 'at://did:plc:alice/site.standard.publication/pub1',
	siteSlug: 'my-blog',
	blocks: [],
};

const listAllMyArticles = vi.fn();
vi.mock( '../lib/publish/publisher', () => ( {
	listAllMyArticles: () => listAllMyArticles(),
	unpublish: vi.fn().mockResolvedValue( undefined ),
} ) );

// Imported after the mock so the component picks up the mocked module.
const { default: MyArticles } = await import( './MyArticles' );

let container: HTMLDivElement;
let root: Root;

beforeEach( () => {
	listAllMyArticles.mockResolvedValue( [ sampleArticle ] );
	container = document.createElement( 'div' );
	document.body.appendChild( container );
	root = createRoot( container );
} );

afterEach( () => {
	act( () => root.unmount() );
	container.remove();
	vi.clearAllMocks();
} );

async function renderList( handle: string | null ): Promise< void > {
	await act( async () => {
		root.render(
			createElement( MyArticles, {
				agent: {} as Agent,
				did: 'did:plc:alice',
				handle,
				refreshKey: 0,
				onEdit: () => {},
			} )
		);
	} );
}

describe( 'MyArticles view link', () => {
	it( 'links each article to its public page when a handle is known', async () => {
		await renderList( 'alice.test' );

		const link = container.querySelector< HTMLAnchorElement >( 'a.myarticles__view' );
		expect( link ).not.toBeNull();
		expect( link?.getAttribute( 'href' ) ).toBe( '/@alice.test/my-blog/3kabc123' );
		expect( link?.textContent ).toContain( 'View' );
	} );

	it( 'omits the view link when no handle is available', async () => {
		await renderList( null );

		expect( container.querySelector( 'a.myarticles__view' ) ).toBeNull();
		// The other actions still render.
		expect( container.textContent ).toContain( 'Edit' );
	} );
} );
