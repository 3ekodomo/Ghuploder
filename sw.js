self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    // Check if the URL ends with share-target
    if (event.request.method === 'POST' && event.request.url.endsWith('share-target')) {
        event.respondWith((async () => {
            const formData = await event.request.formData();
            const file = formData.get('file');
            
            const cache = await caches.open('shared-files');
            await cache.put('/shared-file', new Response(file));
            
            // Redirect back to the relative index.html
            return Response.redirect('./index.html', 303);
        })());
    }
});
