const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!(options.body instanceof FormData) && options.body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (response.status === 204) {
    return undefined as T;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(response.status, data?.error?.message ?? 'Request failed.', data?.error?.details);
  }

  return data as T;
}

export interface AuthResponse {
  token: string;
  user: { id: string; email: string; name: string; role: string; organizationId: string };
}

export interface DocumentDto {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: 'processing' | 'ready' | 'failed';
  errorMessage: string | null;
  createdAt: string;
  chunkCount?: number;
}

export interface ConversationDto {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CitationDto {
  documentId: string;
  documentFilename: string;
  snippet: string;
  score: number;
}

export interface MessageDto {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  citations: CitationDto[];
}

export const api = {
  register: (input: { email: string; password: string; name: string; organizationName: string }) =>
    request<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify(input) }),

  login: (input: { email: string; password: string }) =>
    request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify(input) }),

  listDocuments: (token: string) => request<{ documents: DocumentDto[] }>('/documents', {}, token),

  uploadDocument: (token: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return request<{ document: DocumentDto }>('/documents', { method: 'POST', body: formData }, token);
  },

  deleteDocument: (token: string, documentId: string) =>
    request<void>(`/documents/${documentId}`, { method: 'DELETE' }, token),

  listConversations: (token: string) =>
    request<{ conversations: ConversationDto[] }>('/conversations', {}, token),

  createConversation: (token: string, title?: string) =>
    request<{ conversation: ConversationDto }>(
      '/conversations',
      { method: 'POST', body: JSON.stringify({ title }) },
      token
    ),

  getConversation: (token: string, conversationId: string) =>
    request<{ conversation: ConversationDto & { messages: MessageDto[] } }>(
      `/conversations/${conversationId}`,
      {},
      token
    ),

  sendMessage: (token: string, conversationId: string, content: string) =>
    request<{ assistantMessageId: string; answer: string; citations: CitationDto[] }>(
      `/conversations/${conversationId}/messages`,
      { method: 'POST', body: JSON.stringify({ content }) },
      token
    )
};
