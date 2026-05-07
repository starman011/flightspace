/* ObjectTracer Service Worker — Push Notifications */

self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  const title = data.title || 'ObjectTracer'
  const options = {
    body: data.body || '',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: data.tag || 'launch',
    data: { url: data.url || '/' },
    vibrate: [200, 100, 200],
    actions: data.actions || [],
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return clients.openWindow(url)
    })
  )
})
