import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getToken, getUser, clearAuth } from '../lib/api';
import { ChatMessage, Message } from '../components/ChatMessage';

interface Document {
  id: string;
  filename: string;
  status: string;
  error_message: string | null;
}

export default function Chat() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!getToken()) navigate('/login');
  }, [navigate]);

  async function refreshDocuments() {
    try {
      const res = await api<{ documents: Document[] }>('/v1/documents');
      setDocuments(res.documents);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    refreshDocuments();
    const interval = setInterval(refreshDocuments, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const query = input.trim();
    if (!query || streaming) return;

    setError(null);
    setInput('');

    const userMessage: Message = { role: 'user', content: query };
    setMessages((prev) => [...prev, userMessage]);

    const assistantIndex = messages.length + 1;
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
    setStreaming(true);

    try {
      const token = getToken();
      const res = await fetch('/api/v1/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ query, conversationId }),
      });

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Stream failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
          const raw = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);

          const lines = raw.split('\n');
          let eventType = 'message';
          let dataStr = '';
          for (const line of lines) {
            if (line.startsWith('event:')) eventType = line.slice(6).trim();
            else if (line.startsWith('data:')) dataStr += line.slice(5).trim();
          }

          if (dataStr) {
            try {
              const payload = JSON.parse(dataStr);
              if (eventType === 'meta') {
                if (payload.conversationId) setConversationId(payload.conversationId);
              } else if (eventType === 'token') {
                setMessages((prev) => {
                  const next = [...prev];
                  next[assistantIndex] = {
                    ...next[assistantIndex],
                    content: next[assistantIndex].content + payload.text,
                  };
                  return next;
                });
              } else if (eventType === 'citations') {
                setMessages((prev) => {
                  const next = [...prev];
                  next[assistantIndex] = {
                    ...next[assistantIndex],
                    citations: payload.citations,
                  };
                  return next;
                });
              } else if (eventType === 'error') {
                setError(payload.message ?? 'Stream error');
              }
            } catch {
              /* skip malformed */
            }
          }

          boundary = buffer.indexOf('\n\n');
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStreaming(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      await api('/v1/documents/upload', { method: 'POST', body: form });
      await refreshDocuments();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  function logout() {
    clearAuth();
    navigate('/login');
  }

  const user = getUser();

  return (
    <div className="flex h-screen">
      <aside className="w-64 border-r bg-white flex flex-col">
        <div className="p-4 border-b">
          <h1 className="font-bold">Aperture</h1>
          <p className="text-xs text-gray-500 truncate">{user?.email}</p>
        </div>

        <div className="p-4 border-b">
          <label className="cursor-pointer block text-center text-sm bg-blue-600 text-white rounded py-2 hover:bg-blue-700">
            {uploading ? 'Uploading…' : 'Upload document'}
            <input
              type="file"
              className="hidden"
              onChange={handleUpload}
              disabled={uploading}
              accept=".pdf,.docx,.doc,.txt,.md,.csv,.xlsx,.pptx,.html"
            />
          </label>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <h2 className="text-xs uppercase text-gray-500 mb-2">Documents</h2>
          {documents.length === 0 && (
            <p className="text-xs text-gray-400">No documents yet</p>
          )}
          <ul className="space-y-2">
            {documents.map((d) => (
              <li key={d.id} className="text-sm">
                <p className="truncate">{d.filename}</p>
                <p
                  className={
                    'text-xs ' +
                    (d.status === 'ready'
                      ? 'text-green-600'
                      : d.status === 'failed'
                      ? 'text-red-600'
                      : 'text-gray-500')
                  }
                >
                  {d.status}
                  {d.error_message ? ` — ${d.error_message}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <div className="p-4 border-t">
          <button
            onClick={logout}
            className="w-full text-sm text-gray-600 hover:text-gray-900"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col">
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 mt-20">
              <p className="text-lg font-medium">Ask a question about your documents</p>
              <p className="text-sm mt-1">
                Upload a file on the left, wait for it to become <em>ready</em>, then start chatting.
              </p>
            </div>
          )}
          {messages.map((m, i) => (
            <ChatMessage key={i} message={m} />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {error && <div className="px-6 pb-2 text-sm text-red-600">{error}</div>}

        <form onSubmit={sendMessage} className="border-t bg-white p-4 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={streaming ? 'Streaming…' : 'Ask a question…'}
            disabled={streaming}
            className="flex-1 border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            className="bg-blue-600 text-white px-4 rounded font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </main>
    </div>
  );
}