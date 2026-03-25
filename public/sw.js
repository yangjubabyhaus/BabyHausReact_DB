const VERSION = 'v6';
const CACHE_NAME = 'babyhaus-' + VERSION;

self.addEventListener('install', e => { self.skipWaiting(); });

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.destination === 'document') {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type !== 'opaque') {
          const toCache = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, toCache));
        }
        return res;
      }).catch(() => null);
    })
  );
});

// ===== PUSH (iOS 호환) =====
self.addEventListener('push', e => {
  let title = 'BABY HAÜS';
  let body = '새 알림이 있습니다.';
  let tag = 'babyhaus';

  if (e.data) {
    try {
      const d = e.data.json();
      title = d.title || title;
      body = d.body || body;
      tag = d.tag || tag;
    } catch {
      body = e.data.text() || body;
    }
  }

  // iOS는 최소한의 옵션만 사용
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon.svg',
      tag,
      renotify: true,
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      return clients.openWindow('/admin');
    })
  );
});
