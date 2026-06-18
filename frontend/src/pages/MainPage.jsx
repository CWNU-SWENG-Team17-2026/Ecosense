import { useNavigate } from 'react-router-dom';

import { useAuthStore } from '../stores/useAuthStore';
import './MainPage.css';

export default function MainPage() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuthStore();

  return (
    <section className="main-page">
      <div className="main-card">

        <div className="main-auth-status">
          {isAuthenticated ? (
            <p className="main-auth-status__logged-in">
              <span className="main-auth-dot main-auth-dot--on" />
              {user?.email ?? '로그인됨'}
            </p>
          ) : (
            <p className="main-auth-status__guest">
              <span className="main-auth-dot" />
              비회원 모드 ·
              <button type="button" onClick={() => navigate('/login')}>
                로그인
              </button>
            </p>
          )}
        </div>

        <img
          src="/images/logo.png"
          alt="EcoSense"
          className="main-logo"
        />

        <div className="main-menu-grid">

          <button
            className="menu-image-button"
            onClick={() => navigate('/outdoor')}
          >
            <img src="/images/outdoor.png" alt="실외" />
          </button>

          <button
            className="menu-image-button"
            onClick={() => navigate('/indoor')}
          >
            <img src="/images/indoor.png" alt="실내" />
          </button>

          <button
            className="menu-image-button menu-settings"
            onClick={() => navigate('/settings')}
          >
            <img src="/images/settings.png" alt="설정" />
          </button>

          <button
            className="menu-image-button"
            onClick={() => navigate('/sleep')}
          >
            <img src="/images/sleep.png" alt="수면/소음" />
          </button>

          <button
            className="menu-image-button"
            onClick={() => navigate('/reports')}
          >
            <img src="/images/report.png" alt="보고서" />
          </button>

        </div>
      </div>
    </section>
  );
}