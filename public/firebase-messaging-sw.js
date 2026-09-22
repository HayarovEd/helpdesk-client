/* Firebase public web configuration; no server credentials are included. */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: 'AIzaSyBlbLzBtV1hs-MQ4MCeadSqlHuuS2ci25A',
  authDomain: 'impuls-help-desk.firebaseapp.com',
  projectId: 'impuls-help-desk',
  storageBucket: 'impuls-help-desk.firebasestorage.app',
  messagingSenderId: '895266387008',
  appId: '1:895266387008:web:560f7516d3c6fb4ceadba5',
})

const messaging = firebase.messaging()

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || 'Новое сообщение'
  const body = payload.notification?.body || payload.data?.body || 'В чате появилось новое сообщение'
  self.registration.showNotification(title, {
    body,
    icon: '/favicon.svg',
    data: payload.data || {},
  })
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
    const chatClient = windowClients.find((client) => 'focus' in client)
    if (chatClient) return chatClient.focus()
    return clients.openWindow('/')
  }))
})
