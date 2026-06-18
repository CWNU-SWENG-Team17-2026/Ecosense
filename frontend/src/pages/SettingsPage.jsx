import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useSync } from '../hooks/useSync';
import { logout as logoutApi } from '../services/auth';
import { useAuthStore } from '../stores/useAuthStore';
import { useOutdoorStore } from '../stores/useOutdoorStore';

export default function SettingsPage() {
  const navigate = useNavigate();
  const [isSyncing, setIsSyncing] = useState(false);

  const { user, isAuthenticated, logout } = useAuthStore();
  const { location } = useOutdoorStore();
  const { syncAll } = useSync();

  const handleLogout = async () => {
    try {
      await logoutApi();
    } catch (error) {
      console.error('로그아웃 API 실패:', error);
    } finally {
      logout();
      navigate('/login');
    }
  };

  const handleSyncUpload = async () => {
    try {
      setIsSyncing(true);
      const ok = await syncAll();
      if (ok) {
        alert('로컬 데이터 동기화가 완료되었습니다.');
      } else {
        alert('동기화에 실패했습니다.');
      }
    } catch (error) {
      console.error('동기화 실패:', error);
      alert('동기화에 실패했습니다.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <section className="settings-page p-6 max-w-2xl mx-auto text-white">
      <div className="ecosense-card">
        <h2 className="text-2xl font-bold mb-6">설정</h2>

        {isAuthenticated ? (
          <>
            <div className="setting-item mb-4 text-left">
              <h3 className="text-sm text-zinc-400 mb-1">계정 정보</h3>
              <p>{user?.email ?? '이메일 정보 없음'}</p>
            </div>

            <div className="setting-item mb-6 text-left">
              <h3 className="text-sm text-zinc-400 mb-1">현재 지역</h3>
              <p>{location}</p>
            </div>

            <button
              type="button"
              onClick={handleSyncUpload}
              disabled={isSyncing}
              className="w-full mb-3 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white py-4 rounded-2xl"
            >
              {isSyncing ? '동기화 중...' : '데이터 동기화'}
            </button>

            <button
              type="button"
              className="logout-button w-full bg-red-500/90 hover:bg-red-500 text-white py-4 rounded-2xl"
              onClick={handleLogout}
            >
              로그아웃
            </button>
          </>
        ) : (
          <>
            <div className="setting-item mb-4 text-left">
              <h3 className="text-sm text-zinc-400 mb-1">비회원 모드</h3>
              <p>현재 비회원으로 사용 중입니다.</p>
            </div>

            <div className="guest-actions flex gap-3">
              <button
                type="button"
                className="flex-1 btn-primary"
                onClick={() => navigate('/login')}
              >
                로그인
              </button>

              <button
                type="button"
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white py-3 rounded-2xl"
                onClick={() => navigate('/register')}
              >
                회원가입
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}