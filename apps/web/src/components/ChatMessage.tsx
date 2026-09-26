export interface Citation {
  chunkId: string;
  documentId: string;
  documentFilename: string;
  content: string;
  score: number;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
}

export function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={
          'max-w-2xl rounded-lg px-4 py-2 ' +
          (isUser ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200')
        }
      >
        <p className="whitespace-pre-wrap break-words">
          {message.content || <span className="text-gray-400">…</span>}
        </p>

        {!isUser && message.citations && message.citations.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-500 mb-1">Sources</p>
            <ul className="space-y-1">
              {message.citations.map((c) => (
                <li key={c.chunkId} className="text-xs text-gray-600">
                  <span className="font-medium">{c.documentFilename}</span>
                  <span className="text-gray-400"> · score {c.score.toFixed(3)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}