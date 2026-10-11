/**
 * MAVE Bus Tracking - Service worker
 * Only used to show alert notifications (required on Android) and to make the app installable.
 * No fetch handler and no caching, so the ?v= cache-busting in index.html keeps working.
 */

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// Tapping an alert notification opens the stop page
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const stopId = event.notification.data && event.notification.data.stopId;

    event.waitUntil((async () => {
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const client = windows.find(c => c.url.startsWith(self.registration.scope));

        if (client) {
            await client.focus();
            if (stopId) client.postMessage({ type: 'open-stop', stopId });
            return;
        }

        const url = new URL('./', self.registration.scope);
        if (stopId) url.searchParams.set('stop', stopId);
        await self.clients.openWindow(url.href);
    })());
});
