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

declare module '@wordpress/block-editor' {
	import type { ComponentType, ReactNode } from 'react';
	import type { BlockInstance } from '@wordpress/blocks';

	export const BlockEditorProvider: ComponentType< {
		value: BlockInstance[];
		onInput?: ( blocks: BlockInstance[] ) => void;
		onChange?: ( blocks: BlockInstance[] ) => void;
		settings?: Record< string, unknown >;
		children?: ReactNode;
	} >;
	export const BlockList: ComponentType< Record< string, unknown > >;
	export const BlockTools: ComponentType< { children?: ReactNode } >;
	export const BlockToolbar: ComponentType< { hideDragHandle?: boolean } >;
	export const BlockInspector: ComponentType< Record< string, unknown > >;
	export const Inserter: ComponentType< { rootClientId?: string } >;
	export const WritingFlow: ComponentType< { children?: ReactNode } >;
	export const ObserveTyping: ComponentType< { children?: ReactNode } >;
	export const BlockEditorKeyboardShortcuts: ComponentType<
		Record< string, unknown >
	> & { Register: ComponentType< Record< string, unknown > > };
}

declare module '@wordpress/hooks' {
	export function addFilter(
		hookName: string,
		namespace: string,
		callback: ( ...args: unknown[] ) => unknown,
		priority?: number
	): void;
	export function hasFilter( hookName: string, namespace?: string ): boolean;
	export function applyFilters( hookName: string, value: unknown, ...args: unknown[] ): unknown;
}
