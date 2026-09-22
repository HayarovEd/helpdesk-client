export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? ''

export type ExternalAuthInput = {
  name: string
  login: string
  email: string
  operId: string
  password: string
  token: string
}

export type ManualAuthInput = {
  name: string
  login: string
  email: string
  operId: string
  password: string
  token: string
}

export type ChatCreateInput = {
  name: string
  login: string
  email?: string
  phone: string
  message: string
}

export type Message = {
  id?: string
  text: string
  date?: string
  isSupport?: boolean
  files?: Array<{ id?: string; name?: string; url?: string }>
}

export type Chat = {
  id: string
  name?: string
  login?: string
  email?: string
  phone?: string
  is_open?: boolean
  created_date?: string
  connections?: Array<{ messages?: Message[] }>
}

type RequestOptions = RequestInit & { token?: string }

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`)

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(detail || `Request failed (${response.status})`)
  }
  const body = await response.text()
  return body ? (JSON.parse(body) as T) : (undefined as T)
}

// Kept as a separate adapter because the host app may provide different credentials.
export async function loginFromApp(input: ExternalAuthInput): Promise<string> {
  const requestBody = {
    name: input.name,
    username: input.login,
    email: input.email,
    operId: input.operId,
    password: input.password,
    token: input.token,
  }
  const result = await request<{ token: string }>('/api/auth/login_from_app', {
    method: 'POST',
    body: JSON.stringify(requestBody),
  })
  if (!result?.token) throw new Error('Сервис авторизации не вернул JWT')
  return result.token
}

export async function createChat(input: ChatCreateInput, token: string, groupId: string) {
  return request<Chat>(`/api/chats?groupId=${encodeURIComponent(groupId)}`, {
    method: 'POST',
    token,
    body: JSON.stringify(input),
  })
}

export async function getChat(id: string, token: string) {
  return request<Chat>(`/api/chats/${id}`, { token })
}

export async function getUserChats(login: string, token: string) {
  return request<Chat[]>(`/api/chats/user_chats?login=${encodeURIComponent(login)}`, { token })
}

export async function sendMessage(id: string, text: string, token: string, files: File[] = []) {
  const form = new FormData()
  form.append('data', new Blob([JSON.stringify({ text })], { type: 'application/json' }))
  files.forEach((file) => form.append('files', file, file.name))
  return request<void>(`/api/chats/${id}/message/client`, {
    method: 'POST',
    token,
    body: form,
  })
}

export async function closeChat(id: string, token: string) {
  return request<void>(`/api/chats/${id}/close`, { method: 'POST', token })
}

export async function logout(token: string) {
  return request<void>('/api/auth/logout', { method: 'POST', token })
}
