import { useState } from 'react';
import Header from './Header';
import SideMenu from './SideMenu';
import { useLocation } from 'react-router-dom';

export default function Layout({ children }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();

const pageTitles = {
  '/outdoor': '실외',
  '/indoor': '실내',
  '/sleep': '수면/소음',
  '/reports': '보고서',
  '/settings': '설정',
};

const currentTitle = pageTitles[location.pathname] || '';

  return (
    <div className="app">
      <Header
        title={currentTitle}
        onMenuClick={() => setIsMenuOpen(true)}
      />
      <main className="app-main">{children}
      </main>
      <SideMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
      />
    </div>
  );
}