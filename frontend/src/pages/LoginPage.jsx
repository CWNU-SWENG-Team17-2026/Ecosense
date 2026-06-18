import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { login } from '../services/auth';
import { useAuthStore } from '../stores/useAuthStore';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login: setLogin } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    setError('');
    if (!email.trim() || !password) { setError('이메일과 비밀번호를 입력해주세요.'); return; }
    setIsLoading(true);
    try {
      const user = await login({ email, password });
      setLogin({ id: user.id, email: user.email });
      navigate('/main');
    } catch (err) {
      console.error('로그인 실패:', err);
      const status = err?.response?.status;
      if (status === 401) setError('이메일 또는 비밀번호가 올바르지 않습니다.');
      else setError('로그인에 실패했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleLogin();
  };

  return (
    <section className="login-page">
      <div className="login-card">
        <h1>EcoSense</h1>

        <label>
          이메일
          <input
            value={email}
            onChange={(event) => { setEmail(event.target.value); setError(''); }}
            placeholder="이메일"
            type="email"
            onKeyDown={handleKeyDown}
          />
        </label>

        <label>
          비밀번호
          <input
            type="password"
            value={password}
            onChange={(event) => { setPassword(event.target.value); setError(''); }}
            placeholder="비밀번호"
            onKeyDown={handleKeyDown}
          />
        </label>

        {error && (
          <p style={{ color: '#f87171', fontSize: '0.85rem', margin: '4px 0' }}>{error}</p>
        )}

        <button type="button" onClick={handleLogin} disabled={isLoading}>
          {isLoading ? '로그인 중...' : '로그인'}
        </button>

        <button type="button" onClick={() => navigate('/main')}>
          비회원으로 시작
        </button>

        <button type="button" onClick={() => navigate('/register')}>
          회원가입 하러가기
        </button>
      </div>
    </section>
  );
}