/**
 * Minimal ambient types for the `@wordpress/*` packages we use that ship no
 * TypeScript declarations (no `types` field, no build-types). Scoped to the surface
 * SkyPress actually calls — enough to keep `astro check` honest without pulling the
 * stale community `@types/wordpress__*` packages.
 */
declare module '@wordpress/blocks' {
	export interface BlockInstance {
		name: string;
		attributes: Record< string, unknown >;
		innerBlocks: BlockInstance[];
		clientId?: string;
	}

	export function createBlock(
		name: string,
		attributes?: Record< string, unknown >,
		innerBlocks?: BlockInstance[]
	): BlockInstance;

	export function serialize( blocks: BlockInstance[] | BlockInstance ): string;
	export function parse( content: string ): BlockInstance[];
	export function registerBlockType( ...args: unknown[] ): unknown;
	export function unregisterBlockType( name: string ): unknown;
	export function getBlockTypes(): Array< { name: string } >;
}

declare module '@wordpress/block-library' {
	export function registerCoreBlocks(): void;
}
