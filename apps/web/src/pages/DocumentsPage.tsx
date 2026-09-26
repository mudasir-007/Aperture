import { ChangeEvent, useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, ApiError, DocumentDto } from '../api/client';

export function DocumentsPage() {
  const { token } = useAuth();
  const [documents, setDocuments] = useState<DocumentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const { documents } = await api.listDocuments(token);
      setDocuments(documents);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load documents.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !token) return;

    setUploading(true);
    setError(null);
    try {
      await api.uploadDocument(token, file);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(documentId: string) {
    if (!token) return;
    try {
      await api.deleteDocument(token, documentId);
      setDocuments((docs) => docs.filter((d) => d.id !== documentId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Delete failed.');
    }
  }

  return (
    <div className="page">
      <h2>Documents</h2>
      <p className="hint">
        Upload plain text (.txt) or Markdown (.md) files. They&apos;ll be chunked, embedded, and made searchable in
        chat automatically.
      </p>

      <div className="upload-row">
        <label className="upload-button">
          {uploading ? 'Uploading...' : 'Upload document'}
          <input type="file" accept=".txt,.md,text/plain,text/markdown" onChange={handleFileChange} hidden disabled={uploading} />
        </label>
      </div>

      {error && <p className="error-text">{error}</p>}

      {loading ? (
        <p>Loading documents...</p>
      ) : documents.length === 0 ? (
        <p className="empty-state">No documents yet. Upload one to start chatting with it.</p>
      ) : (
        <table className="documents-table">
          <thead>
            <tr>
              <th>Filename</th>
              <th>Status</th>
              <th>Chunks</th>
              <th>Uploaded</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr key={doc.id}>
                <td>{doc.filename}</td>
                <td>
                  <span className={`status-badge status-${doc.status}`}>{doc.status}</span>
                  {doc.status === 'failed' && doc.errorMessage && (
                    <div className="error-text small">{doc.errorMessage}</div>
                  )}
                </td>
                <td>{doc.chunkCount ?? '-'}</td>
                <td>{new Date(doc.createdAt).toLocaleString()}</td>
                <td>
                  <button className="link-button" onClick={() => handleDelete(doc.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
