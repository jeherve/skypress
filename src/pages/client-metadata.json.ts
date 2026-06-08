import type { APIRoute } from 'astro';

/**
 * The atproto OAuth client metadata document (Decision 0004).
 *
 * Served by the WORKER (`prerender = false`), not as a static asset — static `.json`
 * serving on Cloudflare proved unreliable at the deployed origin, and the worker route is
 * guaranteed to run. Generated from the REQUEST origin so `client_id` always equals the
 * URL it's fetched from (works on the apex domain, www, or any preview origin), and the
 * `redirect_uri` matches the editor's canonical path `/editor/` (trailing slash — see
 * docs/specs/sp7-deploy.md).
 *
 * In dev (loopback) the browser client builds its own metadata and never fetches this;
 * this is the production/hosted client.
 */
export const prerender = false;

export const GET: APIRoute = ( { url } ) => {
	const origin = url.origin;
	const metadata = {
		client_id: `${ origin }/client-metadata.json`,
		client_name: 'SkyPress',
		client_uri: origin,
		redirect_uris: [ `${ origin }/editor/` ],
		scope: 'atproto transition:generic',
		grant_types: [ 'authorization_code', 'refresh_token' ],
		response_types: [ 'code' ],
		token_endpoint_auth_method: 'none',
		application_type: 'web',
		dpop_bound_access_tokens: true,
	};
	return new Response( JSON.stringify( metadata, null, 2 ), {
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'cache-control': 'public, max-age=300',
		},
	} );
};
