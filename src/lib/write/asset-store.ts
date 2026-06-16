/**
 * A small async key→value store for held image bytes (data: URLs) in the writing-first flow.
 * Held bytes can be large, so they live here (IndexedDB) rather than in localStorage with the
 * draft metadata. `put` MERGES (does not replace the whole store) so adding an image keeps the
 * earlier ones; `clear` empties everything (called after a successful publish or a discard).
 */
export interface AssetStore {
	put( assets: Record< string, string > ): Promise< void >;
	getAll(): Promise< Record< string, string > >;
	clear(): Promise< void >;
}

/** In-memory store: the test/SSR/quota-failure fallback. Survives nothing past a reload. */
export function createMemoryAssetStore(): AssetStore {
	let map: Record< string, string > = {};
	return {
		async put( assets ) {
			map = { ...map, ...assets };
		},
		async getAll() {
			return { ...map };
		},
		async clear() {
			map = {};
		},
	};
}

const DEFAULT_DB = 'skypress-write';
const DEFAULT_STORE = 'assets';

function openDb( dbName: string, storeName: string ): Promise< IDBDatabase > {
	return new Promise( ( resolve, reject ) => {
		const req = indexedDB.open( dbName, 1 );
		req.onupgradeneeded = () => {
			if ( ! req.result.objectStoreNames.contains( storeName ) ) {
				req.result.createObjectStore( storeName );
			}
		};
		req.onsuccess = () => resolve( req.result );
		req.onerror = () => reject( req.error ?? new Error( 'IndexedDB open failed' ) );
	} );
}

/**
 * IndexedDB-backed asset store. Each token is one record keyed by the token string. Falls back
 * to an in-memory store when IndexedDB is unavailable (e.g. SSR/tests) so callers never crash.
 */
export function createIndexedDbAssetStore(
	dbName: string = DEFAULT_DB,
	storeName: string = DEFAULT_STORE
): AssetStore {
	if ( typeof indexedDB === 'undefined' ) {
		return createMemoryAssetStore();
	}

	const tx = async < T >(
		mode: IDBTransactionMode,
		run: ( store: IDBObjectStore ) => IDBRequest | void,
		read?: ( store: IDBObjectStore ) => IDBRequest< T >
	): Promise< T | void > => {
		const db = await openDb( dbName, storeName );
		return new Promise< T | void >( ( resolve, reject ) => {
			const transaction = db.transaction( storeName, mode );
			const store = transaction.objectStore( storeName );
			let readReq: IDBRequest< T > | undefined;
			if ( read ) {
				readReq = read( store );
			} else {
				run( store );
			}
			transaction.oncomplete = () => {
				db.close();
				resolve( readReq ? readReq.result : undefined );
			};
			transaction.onerror = () => {
				db.close();
				reject( transaction.error ?? new Error( 'IndexedDB transaction failed' ) );
			};
		} );
	};

	return {
		async put( assets ) {
			await tx( 'readwrite', ( store ) => {
				for ( const [ key, value ] of Object.entries( assets ) ) {
					store.put( value, key );
				}
			} );
		},
		async getAll() {
			const db = await openDb( dbName, storeName );
			return new Promise< Record< string, string > >( ( resolve, reject ) => {
				const transaction = db.transaction( storeName, 'readonly' );
				const store = transaction.objectStore( storeName );
				const keysReq = store.getAllKeys();
				const valsReq = store.getAll();
				transaction.oncomplete = () => {
					db.close();
					const out: Record< string, string > = {};
					( keysReq.result as IDBValidKey[] ).forEach( ( k, i ) => {
						out[ String( k ) ] = valsReq.result[ i ] as string;
					} );
					resolve( out );
				};
				transaction.onerror = () => {
					db.close();
					reject( transaction.error ?? new Error( 'IndexedDB read failed' ) );
				};
			} );
		},
		async clear() {
			await tx( 'readwrite', ( store ) => store.clear() );
		},
	};
}
