self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    // Intercept the Web Share Target POST request
    if (event.request.method === 'POST' && event.request.url.endsWith('/share-target')) {
        event.respondWith((async () => {
            const formData = await event.request.formData();
            const file = formData.get('file');
            
            // Store the shared file in the Cache API temporarily
            const cache = await caches.open('shared-files');
            await cache.put('/shared-file', new Response(file));
            
            // Redirect back to the main app page
            return Response.redirect('/index.html', 303);
        })());
    }
});
