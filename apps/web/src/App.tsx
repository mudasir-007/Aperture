import { NavLink, Route, Routes, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { RequireAuth } from './components/RequireAuth';
import { LoginPage } from './pages/LoginPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { ChatPage } from './pages/ChatPage';

export function App() {
  const { user, logout, token } = useAuth();

  return (
    <div className="app-shell">
      {token && (
        <header className="top-bar">
          <div className="brand">RAG Chat</div>
          <nav>
            <NavLink to="/chat" className={({ isActive }) => (isActive ? 'active' : '')}>
              Chat
            </NavLink>
            <NavLink to="/documents" className={({ isActive }) => (isActive ? 'active' : '')}>
              Documents
            </NavLink>
          </nav>
          <div className="user-info">
            <span>{user?.name}</span>
            <button className="link-button" onClick={logout}>
              Log out
            </button>
          </div>
        </header>
      )}

      <div className="app-body">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/documents" element={<DocumentsPage />} />
          </Route>
          <Route path="*" element={<Navigate to={token ? '/chat' : '/login'} replace />} />
        </Routes>
      </div>
    </div>
  );
}
