# Helpdesk client

Встраиваемый React/TypeScript виджет клиентской поддержки: авторизация, создание и просмотр чата, отправка текста и файлов.

## Запуск

```bash
npm install
npm run dev
```

Для авторизации незарегистрированного пользователя откройте страницу:

```text
http://localhost:5173/unregistered-login
```

Страница запрашивает имя, email и телефон, выполняет вход через `unregistered_login`, автоматически создаёт новый чат и открывает окно переписки.

Настройки можно передать через `.env.local`:

```env
# Для dev можно оставить пустым: Vite проксирует /api на backend.
VITE_API_BASE_URL=

VITE_HOST_ORIGIN=https://your-host.example

# Необязательно: Firebase Web config и VAPID key можно переопределить через env.
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_VAPID_KEY=
```

Сообщения отправляются через `multipart/form-data`: JSON части `data` содержит `{ "text": "..." }`, а выбранные файлы передаются отдельными частями `files`. Это необходимо, потому что backend принимает сообщение через `@RequestPart`.

В чате поддерживается предпросмотр изображений, PDF, TXT/RTF и видео (`mp4`, `mpeg`, `ogg`, `webm`, `mov`, `avi`, `mkv`, `mp2t`) с увеличением в модальном окне. DOC/DOCX, XLS/XLSX и PPT/PPTX показываются как доступные для открытия/скачивания документы; их встроенный просмотр требует конвертера на backend или внешнего viewer-сервиса.

JWT не сохраняется в `localStorage` или cookies и живёт только в памяти вкладки. Формат `login_from_app` вынесен в `src/api.ts`; поля `token` и `password` должны передаваться внешним приложением безопасным способом.

В dev запрос авторизации выполняется именно на `http://localhost:5174/api/auth/login_from_app` (или на порт, который покажет Vite), а Vite проксирует его на `http://10.222.222.174:9092/api/auth/login_from_app`. После изменения `vite.config.ts` перезапустите `npm run dev`.

## Авторизация из внешнего приложения

Внешнее приложение может открыть виджет и передать данные через `postMessage`:

```js
widgetWindow.postMessage({
  type: 'helpdesk-auth',
  payload: {
    name: 'Иван',
    login: 'ivan',
    email: 'ivan@example.com',
    operId: '42',
    password: 'password',
    token: 'external-verification-token'
  }
}, 'https://your-widget.example')
```

После получения сообщения виджет передаёт данные в `POST /api/auth/login_from_app`, получает JWT и использует его в запросах чата. Для защиты от сообщений с других сайтов задайте `VITE_HOST_ORIGIN`. Если переменная не задана, сообщения принимаются от любого origin, поэтому для production её нужно указать.

При запросе к backend значение внешнего поля `login` отправляется как `username`.

`token` из внешнего приложения передаётся в `login_from_app` только для проверки backend. JWT, возвращённый endpoint в ответе, хранится в памяти и используется отдельно для запросов чата.

После получения JWT клиент вызывает `GET /api/chats/user_chats?login=<login>`. Если есть открытые чаты, выбирается самый новый по `created_date`, затем загружается его полная переписка через `GET /api/chats/{id}`. Если открытых чатов нет, отображается создание нового чата. При создании чата параметр `groupId` получает значение `operId` из внешнего приложения.

Кнопка «Выйти» завершает текущую сессию через `POST /api/auth/logout` и очищает данные авторизации из памяти. Пользовательский интерфейс не содержит операции закрытия чата: закрывать обращения может только поддержка или администратор.

При выходе после `login_from_app` виджет отправляет внешней странице сообщение `helpdesk-logout`. Внешняя страница должна обработать его и вернуть пользователя в свой интерфейс:

```js
window.addEventListener('message', (event) => {
  if (event.data?.type === 'helpdesk-logout') {
    // Вернуть пользователя на страницу внешнего приложения.
  }
})
```

После загрузки чата клиент подключается к `ws://10.222.222.174:9092/ws/chats/{chatId}/messages`. Токен WebSocket не используется. Обновления применяются только для событий с `event: "UPDATED"` и путём `/chats...`; при разрыве соединение переподключается через 5 секунд. Для другого адреса можно задать `VITE_WEBSOCKET_BASE_URL`.

Для конфигурации Android-формата задайте `VITE_WEB_SOCKET_URL=ws://10.222.222.174:9092/ws`; клиент сам добавит `/chats/{chatId}/messages`.

## Push-уведомления Firebase

После успешной авторизации клиент запрашивает разрешение браузера на уведомления, получает FCM Web Push token и регистрирует его на backend:

```http
POST /api/fcm/register-token
Authorization: Bearer <JWT>
Content-Type: application/json
```

```json
{
  "token": "<FCM token>",
  "device_id": "<стабильный идентификатор браузера>",
  "device_name": "<user agent>",
  "platform": "web"
}
```

В foreground уведомление показывается браузером сразу. В background его показывает `public/firebase-messaging-sw.js`. Для production сайт должен работать через HTTPS; `localhost` разрешён браузерами для разработки. Firebase Web config и VAPID key являются публичными web-настройками и могут быть переопределены через `.env.local`.

## Отдельная авторизация незарегистрированного пользователя

Откройте `/unregistered-login`. Страница вызывает `POST /api/auth/unregistered_login` с телом:

```json
{
  "name": "Иван",
  "email": "ivan@example.com",
  "phone": "+79990000000"
}
```

После успешной авторизации клиент сразу создаёт новый чат через `POST /api/chats?groupId=00000000-0000-0000-0000-000000000009` и открывает его в интерфейсе переписки. Дополнительно страница отправляет родительскому окну сообщение `helpdesk-unregistered-auth` с JWT через `postMessage`. JWT не сохраняется в `localStorage` или cookies.

Кнопка «Выйти» завершает сессию и возвращает пользователя на `/unregistered-login`.
