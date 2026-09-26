import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, ApiError, ConversationDto, MessageDto } from '../api/client';

export function ChatPage() {
  const { token } = useAuth();
  const [conversations, setConversations] = useState<ConversationDto[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshConversations = useCallback(async () => {
    if (!token) return;
    const { conversations } = await api.listConversations(token);
    setConversations(conversations);
    return conversations;
  }, [token]);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  const openConversation = useCallback(
    async (id: string) => {
      if (!token) return;
      setActiveId(id);
      setLoadingConversation(true);
      setError(null);
      try {
        const { conversation } = await api.getConversation(token, id);
        setMessages(conversation.messages);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to load conversation.');
      } finally {
        setLoadingConversation(false);
      }
    },
    [token]
  );

  async function handleNewConversation() {
    if (!token) return;
    const { conversation } = await api.createConversation(token);
    setConversations((list) => [conversation, ...list]);
    setMessages([]);
    setActiveId(conversation.id);
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!token || !input.trim()) return;

    let conversationId = activeId;
    if (!conversationId) {
      const { conversation } = await api.createConversation(token);
      setConversations((list) => [conversation, ...list]);
      conversationId = conversation.id;
      setActiveId(conversationId);
    }

    const content = input;
    setInput('');
    setMessages((prev) => [
      ...prev,
      { id: `pending-${Date.now()}`, role: 'user', content, createdAt: new Date().toISOString(), citations: [] }
    ]);
    setSending(true);
    setError(null);

    try {
      const result = await api.sendMessage(token, conversationId, content);
      setMessages((prev) => [
        ...prev,
        {
          id: result.assistantMessageId,
          role: 'assistant',
          content: result.answer,
          createdAt: new Date().toISOString(),
          citations: result.citations
        }
      ]);
      refreshConversations();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to send message.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="chat-layout">
      <aside className="conversation-list">
        <button className="new-conversation-button" onClick={handleNewConversation}>
          + New conversation
        </button>
        {conversations.length === 0 && <p className="empty-state small">No conversations yet.</p>}
        <ul>
          {conversations.map((c) => (
            <li key={c.id}>
              <button
                className={`conversation-item ${c.id === activeId ? 'active' : ''}`}
                onClick={() => openConversation(c.id)}
              >
                {c.title || 'Untitled conversation'}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <main className="chat-main">
        {!activeId && messages.length === 0 && (
          <p className="empty-state">Start typing below to begin a new conversation.</p>
        )}

        {loadingConversation ? (
          <p>Loading...</p>
        ) : (
          <div className="message-list">
            {messages.map((m) => (
              <div key={m.id} className={`message message-${m.role}`}>
                <div className="message-content">{m.content}</div>
                {m.citations.length > 0 && (
                  <div className="citations">
                    <strong>Sources:</strong>
                    <ul>
                      {m.citations.map((c, i) => (
                        <li key={i}>
                          <span className="citation-filename">{c.documentFilename}</span>
                          <span className="citation-snippet">&ldquo;{c.snippet}&rdquo;</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {error && <p className="error-text">{error}</p>}

        <form className="message-input-row" onSubmit={handleSend}>
          <input
            type="text"
            placeholder="Ask a question about your documents..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={sending}
          />
          <button type="submit" disabled={sending || !input.trim()}>
            {sending ? 'Sending...' : 'Send'}
          </button>
        </form>
      </main>
    </div>
  );
}
