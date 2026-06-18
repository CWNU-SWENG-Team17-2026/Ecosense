import { Link } from 'react-router-dom';

export default function BottomTabBar() {
  return (
    <nav>
      <Link to="/outdoor">실외</Link> |{' '}
      <Link to="/indoor">실내</Link> |{' '}
      <Link to="/sleep">수면/소음</Link> |{' '}
      <Link to="/reports">보고서</Link> |{' '}
      <Link to="/settings">설정</Link>
    </nav>
  );
}