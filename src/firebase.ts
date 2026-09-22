import { getApp, getApps, initializeApp } from 'firebase/app'
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyBlbLzBtV1hs-MQ4MCeadSqlHuuS2ci25A',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'impuls-help-desk.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'impuls-help-desk',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'impuls-help-desk.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '895266387008',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:895266387008:web:560f7516d3c6fb4ceadba5',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-TKETJ5YNNH',
}

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY ||
  'BPcOoJS5A7F2p1FbdeMygXf_hSIGWQhDuWCebWs9p2cPO2kEQ_z2Md1jSyQwbOClB2wqf8Nwc0haZ1HA14Zf9Hc'

export type ForegroundNotification = {
  title?: string
  body?: string
}

export async function registerFirebaseMessaging(
  onNotification: (notification: ForegroundNotification) => void,
) {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    throw new Error('Браузер не поддерживает push-уведомления')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Разрешение на push-уведомления не предоставлено')
  }

  if (!(await isSupported())) {
    throw new Error('Firebase Messaging не поддерживается этим браузером')
  }

  const serviceWorkerRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig)
  const messaging = getMessaging(app)
  const fcmToken = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration,
  })

  if (!fcmToken) throw new Error('Firebase не вернул push-токен')

  const unsubscribe = onMessage(messaging, (payload) => {
    onNotification({
      title: payload.notification?.title ?? payload.data?.title,
      body: payload.notification?.body ?? payload.data?.body,
    })
  })

  return { fcmToken, unsubscribe }
}
