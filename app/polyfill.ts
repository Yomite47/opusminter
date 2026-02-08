
if (typeof window === 'undefined' && typeof global !== 'undefined') {
    // Minimal polyfill to prevent ReferenceError during build
    // @ts-ignore
    if (!global.indexedDB) {
        // @ts-ignore
        global.indexedDB = {
            open: () => ({
                onupgradeneeded: null,
                onsuccess: null,
                onerror: null,
                result: {
                    createObjectStore: () => ({
                        createIndex: () => ({} as any),
                    }),
                    transaction: () => ({
                        objectStore: () => ({
                            get: () => ({ onsuccess: null, onerror: null }),
                            put: () => ({ onsuccess: null, onerror: null }),
                            delete: () => ({ onsuccess: null, onerror: null }),
                        }),
                    }),
                },
            }),
        } as any;
    }
}
