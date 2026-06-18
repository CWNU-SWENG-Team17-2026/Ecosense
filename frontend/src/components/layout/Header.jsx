import { useAuthStore } from '../../stores/useAuthStore';

export default function Header({ title, onMenuClick }) {
  const { isAuthenticated, user } = useAuthStore();

  return (
    <header className="page-header">
      <span className="page-title">{title}</span>

      <img
        src="/images/logo-header.png"
        alt="EcoSense"
        className="header-logo"
      />

      <div className="header-actions">
        <span
          className={`header-auth-badge ${
            isAuthenticated ? 'header-auth-badge--logged-in' : ''
          }`}
          title={isAuthenticated ? user?.email : '비회원 모드'}
        >
          {isAuthenticated ? '로그인' : '게스트'}
        </span>
        <button type="button" className="menu-button" onClick={onMenuClick}>
          ☰
        </button>
      </div>
    </header>
  );
}
