import { Link } from 'react-router-dom';

export default function SideMenu({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="side-menu-overlay" onClick={onClose}>
      <aside className="side-menu" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="side-menu-close" onClick={onClose}>
          ×
        </button>

        <nav className="side-menu-nav">
          <Link to="/outdoor" onClick={onClose}>실외</Link>
          <Link to="/indoor" onClick={onClose}>실내</Link>
          <Link to="/sleep" onClick={onClose}>수면/소음</Link>
          <Link to="/reports" onClick={onClose}>보고서</Link>
          <Link to="/settings" onClick={onClose}>설정</Link>
        </nav>
      </aside>
    </div>
  );
}