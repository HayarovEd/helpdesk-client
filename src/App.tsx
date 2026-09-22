import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  BACKEND_BASE_URL,
  closeChat,
  createChat,
  getChat,
  getUserChats,
  loginFromApp,
  logout,
  sendMessage,
} from './api'
import type { Chat, ChatCreateInput, ExternalAuthInput, HelpdeskFile, ManualAuthInput } from './api'
import './App.css'

const allowedHostOrigin = import.meta.env.VITE_HOST_ORIGIN ?? ''
const authMessageType = 'helpdesk-auth'

const initialProfile: ManualAuthInput = {
  name: '',
  login: '',
  email: '',
  operId: '',
  password: '',
  token: '',
}

function flattenMessages(chat: Chat | null) {
  return (chat?.connections?.flatMap((connection) => connection.messages ?? []) ?? [])
    .map((message, index) => ({ message, index }))
    .sort((left, right) => {
      const leftDate = left.message.date ? Date.parse(left.message.date) : Number.POSITIVE_INFINITY
      const rightDate = right.message.date ? Date.parse(right.message.date) : Number.POSITIVE_INFINITY
      return leftDate - rightDate || left.index - right.index
    })
    .map(({ message }) => message)
}

function fileUrl(file: HelpdeskFile) {
  if (!file.image_url) return ''
  if (/^https?:\/\//i.test(file.image_url)) {
    const absoluteUrl = new URL(file.image_url)
    const backendUrl = new URL(BACKEND_BASE_URL)
    if (absoluteUrl.host === backendUrl.host) {
      return `${absoluteUrl.pathname}${absoluteUrl.search}`
    }
    return file.image_url
  }
  return file.image_url.startsWith('/') ? file.image_url : `/${file.image_url}`
}

function formatFileSize(size?: number) {
  if (!size) return ''
  if (size < 1024) return `${size} Б`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} КБ`
  return `${(size / (1024 * 1024)).toFixed(1)} МБ`
}

const imageMimeTypes = new Set([
  'image/jpg',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/svg+xml',
])
const videoMimeTypes = new Set([
  'video/mp4',
  'video/mpeg',
  'video/ogg',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'video/mp2t',
])
const documentMimeTypes = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'application/rtf',
])

function isPreviewable(file: HelpdeskFile) {
  return imageMimeTypes.has(file.mime_type ?? '') ||
    videoMimeTypes.has(file.mime_type ?? '') ||
    documentMimeTypes.has(file.mime_type ?? '')
}

function FilePreview({ file, token, expanded = false }: { file: HelpdeskFile; token: string; expanded?: boolean }) {
  const [resourceUrl, setResourceUrl] = useState('')
  const [loadError, setLoadError] = useState('')
  const mimeType = file.mime_type ?? ''

  useEffect(() => {
    if (!file.image_url) return
    let objectUrl = ''
    const sourceUrl = fileUrl(file)
    fetch(sourceUrl, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.blob()
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob)
        setResourceUrl(objectUrl)
      })
      .catch((cause) => setLoadError(cause instanceof Error ? cause.message : 'Не удалось загрузить файл'))
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [file, token])

  if (loadError) return <span className="file-icon" title={loadError}>!</span>
  if (!resourceUrl) return <span className="file-icon">…</span>

  if (imageMimeTypes.has(mimeType)) {
    return <img className={expanded ? 'preview-image' : 'attachment-preview'} src={resourceUrl} alt={file.original_name ?? 'Изображение'} />
  }
  if (videoMimeTypes.has(mimeType)) {
    return <video className={expanded ? 'preview-video' : 'attachment-preview'} src={resourceUrl} controls preload="metadata" />
  }
  if (mimeType === 'application/pdf') {
    return <iframe className="preview-document" src={resourceUrl} title={file.original_name ?? 'PDF'} />
  }
  if (mimeType === 'text/plain' || mimeType === 'application/rtf') {
    return <iframe className="preview-document text-document" src={resourceUrl} title={file.original_name ?? 'Текстовый документ'} />
  }
  return <div className="preview-non-image"><span className="file-icon large">↗</span><p className="muted">Откройте или скачайте документ для просмотра.</p></div>
}

function App() {
  const [profile, setProfile] = useState(initialProfile)
  const [token, setToken] = useState<string | null>(null)
  const [chat, setChat] = useState<Chat | null>(null)
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [previewFile, setPreviewFile] = useState<HelpdeskFile | null>(null)
  const messagesRef = useRef<HTMLDivElement>(null)

  const messages = useMemo(() => flattenMessages(chat), [chat])

  useEffect(() => {
    const container = messagesRef.current
    if (container) container.scrollTop = container.scrollHeight
  }, [messages])

  useEffect(() => {
    if (!token || !profile.login) return
    let cancelled = false
    setBusy(true)
    getUserChats(profile.login, token)
      .then(async (chats) => {
        if (cancelled || chats.length === 0) return
        const openChats = chats
          .filter((candidate) => candidate.is_open !== false)
          .sort((left, right) => {
            const leftDate = left.created_date ? Date.parse(left.created_date) : 0
            const rightDate = right.created_date ? Date.parse(right.created_date) : 0
            return rightDate - leftDate
          })
        const latestOpenChat = openChats[0]
          if (latestOpenChat) {
            const latestChat = await getChat(latestOpenChat.id, token)
            if (!cancelled) setChat(latestChat)
          }
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Не удалось загрузить ваши чаты')
      })
      .finally(() => {
        if (!cancelled) setBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [profile.login, token])

  useEffect(() => {
    async function receiveHostAuth(event: MessageEvent<{
      type?: string
      payload?: Partial<ExternalAuthInput>
    }>) {
      if (allowedHostOrigin && event.origin !== allowedHostOrigin) return
      if (event.data?.type !== authMessageType || !event.data.payload) return

      const payload = event.data.payload
      if (!payload.name || !payload.login || !payload.email || payload.operId === undefined || !payload.password || !payload.token) {
        setError('Внешнее приложение передало неполные данные авторизации.')
        return
      }

      setBusy(true)
      setError('')
      try {
        const nextProfile: ExternalAuthInput = {
          name: payload.name,
          login: payload.login,
          email: payload.email,
          operId: payload.operId,
          password: payload.password,
          token: payload.token,
        }
        const nextToken = await loginFromApp(nextProfile)
        setProfile(nextProfile)
        setToken(nextToken)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Не удалось войти через внешнее приложение')
      } finally {
        setBusy(false)
      }
    }

    window.addEventListener('message', receiveHostAuth)
    return () => window.removeEventListener('message', receiveHostAuth)
  }, [])

  useEffect(() => {
    if (!token || !chat?.id) return
    const timer = window.setInterval(async () => {
      try {
        setChat(await getChat(chat.id, token))
      } catch {
        // Polling errors are surfaced on the next explicit action to avoid flicker.
      }
    }, 10_000)
    return () => window.clearInterval(timer)
  }, [chat?.id, token])

  function updateProfile(field: keyof ManualAuthInput, value: string | number) {
    setProfile((current) => ({ ...current, [field]: value }))
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const nextToken = await loginFromApp(profile)
      setToken(nextToken)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось войти')
    } finally {
      setBusy(false)
    }
  }

  async function handleCreateChat(event: FormEvent) {
    event.preventDefault()
    if (!token || !profile.operId) {
      setError('Не указан ID оператора.')
      return
    }
    setBusy(true)
    setError('')
    const input: ChatCreateInput = {
      name: profile.name,
      login: profile.login,
      email: profile.email,
      phone: '—',
      message: 'Новый запрос в поддержку',
    }
    try {
      setChat(await createChat(input, token, profile.operId))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось создать чат')
    } finally {
      setBusy(false)
    }
  }

  async function handleSend(event: FormEvent) {
    event.preventDefault()
    if (!token || !chat?.id || !text.trim()) return
    setBusy(true)
    setError('')
    try {
      await sendMessage(chat.id, text.trim(), token, files)
      setText('')
      setFiles([])
      setChat(await getChat(chat.id, token))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось отправить сообщение')
    } finally {
      setBusy(false)
    }
  }

  async function handleClose() {
    if (!token || !chat?.id) return
    setBusy(true)
    setError('')
    try {
      await closeChat(chat.id, token)
      setChat({ ...chat, is_open: false })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось закрыть чат')
    } finally {
      setBusy(false)
    }
  }

  async function handleLogout() {
    if (token) {
      try {
        await logout(token)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Не удалось завершить сессию')
        return
      }
    }
    setToken(null)
    setChat(null)
    setText('')
    setFiles([])
    setPreviewFile(null)
  }

  if (!token) {
    return (
      <main className="shell">
        <section className="card auth-card">
          <div className="brand"><span className="brand-mark">?</span><span>Helpdesk</span></div>
          <p className="eyebrow">Клиентская поддержка</p>
          <h1>Чем можем помочь?</h1>
          <p className="muted">Ожидаем авторизацию от внешнего приложения. Можно также войти вручную.</p>
          <form onSubmit={handleLogin} className="stack">
            <label>Имя<input required value={profile.name} onChange={(e) => updateProfile('name', e.target.value)} placeholder="Ваше имя" /></label>
            <label>Логин<input required value={profile.login} onChange={(e) => updateProfile('login', e.target.value)} placeholder="Логин во внешнем приложении" /></label>
            <label>Email<input type="email" value={profile.email} onChange={(e) => updateProfile('email', e.target.value)} placeholder="you@example.com" /></label>
            <label>ID оператора<input required value={profile.operId} onChange={(e) => updateProfile('operId', e.target.value)} /></label>
            <label>Пароль<input required type="password" value={profile.password} onChange={(e) => updateProfile('password', e.target.value)} /></label>
            <label>Проверочный токен<input required value={profile.token} onChange={(e) => updateProfile('token', e.target.value)} /></label>
            {error && <p className="error">{error}</p>}
            <button disabled={busy}>{busy ? 'Подключение…' : 'Открыть поддержку'}</button>
          </form>
          <p className="footnote">JWT хранится только в памяти текущей вкладки.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="shell">
      <section className="widget card">
        <header className="widget-header">
          <div><div className="brand"><span className="brand-mark">?</span><span>Helpdesk</span></div><p className="muted">Поддержка онлайн</p></div>
          <div className="header-actions">
            {chat && <span className={`status ${chat.is_open === false ? 'closed' : ''}`}>{chat.is_open === false ? 'Закрыт' : 'Открыт'}</span>}
            <button className="logout-button" onClick={handleLogout}>Выйти</button>
          </div>
        </header>
        {!chat ? (
          <div className="empty"><div className="empty-icon">✦</div><h2>Новый чат</h2><p className="muted">Создайте обращение, и специалист ответит в этом окне.</p><form onSubmit={handleCreateChat}><button disabled={busy}>{busy ? 'Создание…' : 'Создать чат'}</button></form></div>
        ) : (
          <>
            <div className="messages" ref={messagesRef}>
              {messages.length === 0 ? <p className="muted empty-line">Сообщений пока нет</p> : messages.map((message, index) => <article className={`message ${message.isSupport ? 'support' : 'client'}`} key={message.id ?? index}><p>{message.text}</p>{message.files?.length ? <div className="attachments">{message.files.map((file, fileIndex) => <button className="attachment" key={`${file.image_url ?? file.original_name}-${fileIndex}`} onClick={() => setPreviewFile(file)} type="button">{file.image_url && isPreviewable(file) ?               <FilePreview file={file} token={token} /> : <span className="file-icon">↗</span>}<span className="attachment-info"><strong>{file.original_name ?? 'Файл'}</strong><small>{formatFileSize(file.file_size)}</small></span></button>)}</div> : null}{message.date && <time>{new Date(message.date).toLocaleString()}</time>}</article>)}
            </div>
            {error && <p className="error inline">{error}</p>}
            {chat.is_open !== false && <form onSubmit={handleSend} className="composer"><textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Напишите сообщение…" rows={2} /><div className="composer-actions"><label className="file-button" title="Прикрепить файл">＋<input type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} /></label><span className="file-names">{files.map((file) => file.name).join(', ')}</span><button disabled={busy || !text.trim()}>{busy ? '…' : 'Отправить'}</button></div></form>}
            <button className="close-button" disabled={busy || chat.is_open === false} onClick={handleClose}>Закрыть чат</button>
          </>
        )}
      </section>
      {previewFile && <div className="preview-backdrop" role="presentation" onClick={() => setPreviewFile(null)}><section className="preview-modal" role="dialog" aria-modal="true" aria-label={previewFile.original_name ?? 'Предпросмотр файла'} onClick={(event) => event.stopPropagation()}><header><strong>{previewFile.original_name ?? 'Файл'}</strong><button type="button" className="preview-close" onClick={() => setPreviewFile(null)} aria-label="Закрыть">×</button></header>{previewFile.image_url && isPreviewable(previewFile) ?       <FilePreview file={previewFile} token={token} expanded /> : <div className="preview-non-image"><span className="file-icon large">↗</span><p className="muted">Предпросмотр недоступен для этого типа файла.</p></div>}<a className="download-button" href={fileUrl(previewFile)} download={previewFile.original_name}>Скачать файл</a></section></div>}
    </main>
  )
}

export default App
