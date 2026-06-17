import type { BlockNode } from '../blocks/render';
import { splitAssets, mergeAssets, type AssetSkeleton } from './held-assets';
import {
	createIndexedDbAssetStore,
	createMemoryAssetStore,
	type AssetStore,
} from './asset-store';

const DRAFT_KEY = 'skypress:write:draft';
const INTENT_KEY = 'skypress:write:publish-intent';

/** The editor content the writing-first flow persists across the OAuth redirect. */
export interface WriteDraft {
	title: string;
	lede: string;
	blocks: BlockNode[];
	coverDataUrl: string | null;
}

interface StoredMeta {
	title: string;
	lede: string;
	skeleton: AssetSkeleton;
}

export interface DraftStore {
	save( draft: WriteDraft ): Promise< void >;
	load(): Promise< WriteDraft | null >;
	clear(): Promise< void >;
	setPublishIntent(): void;
	/** Reads the intent flag and clears it — true at most once per set. */
	consumePublishIntent(): boolean;
}

/**
 * Persist the writing-first draft so it survives the full-page OAuth redirect. Light metadata
 * and the token-skeletoned block tree go in `localStorage`; the heavy image bytes (data: URLs)
 * go in the injected `AssetStore` (IndexedDB in the browser). `setPublishIntent` records that
 * the writer hit Publish before the redirect, so the flow auto-resumes on return.
 */
export function createDraftStore( opts: { assets?: AssetStore; storage?: Storage } = {} ): DraftStore {
	const storage = opts.storage ?? window.localStorage;
	const assets = opts.assets ?? createIndexedDbAssetStore();

	return {
		async save( draft ) {
			const { skeleton, assets: bytes } = splitAssets( draft.blocks, draft.coverDataUrl );
			await assets.clear();
			await assets.put( bytes );
			const meta: StoredMeta = { title: draft.title, lede: draft.lede, skeleton };
			storage.setItem( DRAFT_KEY, JSON.stringify( meta ) );
		},
		async load() {
			const raw = storage.getItem( DRAFT_KEY );
			if ( ! raw ) {
				return null;
			}
			let meta: StoredMeta;
			try {
				meta = JSON.parse( raw ) as StoredMeta;
			} catch {
				return null;
			}
			const bytes = await assets.getAll();
			const { blocks, coverDataUrl } = mergeAssets( meta.skeleton, bytes );
			return { title: meta.title, lede: meta.lede, blocks, coverDataUrl };
		},
		async clear() {
			storage.removeItem( DRAFT_KEY );
			await assets.clear();
		},
		setPublishIntent() {
			storage.setItem( INTENT_KEY, '1' );
		},
		consumePublishIntent() {
			const had = storage.getItem( INTENT_KEY ) === '1';
			storage.removeItem( INTENT_KEY );
			return had;
		},
	};
}

export { createMemoryAssetStore };
