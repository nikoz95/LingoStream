import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './lib/auth';
import LoginPage from './pages/LoginPage';
import LibraryPage from './pages/LibraryPage';
import ReaderPage from './pages/ReaderPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-sepia-bg theme-sepia">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-sepia-text/30 border-t-sepia-text rounded-full animate-spin" />
          <p className="text-sepia-text/60 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/library"
        element={
          <ProtectedRoute>
            <LibraryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reader/:bookId"
        element={
          <ProtectedRoute>
            <ReaderPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/library" replace />} />
    </Routes>
  );
}