# Helpdesk client

Встраиваемый React/TypeScript виджет клиентской поддержки: авторизация, создание и просмотр одного чата, отправка текста и закрытие обращения.

## Запуск

```bash
npm install
npm run dev
```

Настройки можно передать через `.env.local`:

```env
# Для dev можно оставить пустым: Vite проксирует /api на backend.
VITE_API_BASE_URL=

VITE_HOST_ORIGIN=https://your-host.example
```

Сообщения отправляются через `multipart/form-data`: JSON части `data` содержит `{ "text": "..." }`, а выбранные файлы передаются отдельными частями `files`. Это необходимо, потому что backend принимает сообщение через `@RequestPart`.

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
