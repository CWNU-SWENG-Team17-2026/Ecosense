import { useEffect } from 'react';

import { getMe } from '../../services/auth';
import { useAuthStore } from '../../stores/useAuthStore';

export default function AuthBootstrap({ children }) {
  const { login, logout, setInitializing, isInitializing } = useAuthStore();

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const user = await getMe();
        login({ id: user.id, email: user.email });
      } catch {
        logout();
      } finally {
        setInitializing(false);
      }
    };

    restoreSession();
  }, [login, logout, setInitializing]);

  if (isInitializing) {
    return (
      <div className="auth-loading flex items-center justify-center min-h-screen bg-zinc-950 text-zinc-400">
        세션 확인 중...
      </div>
    );
  }

  return children;
}