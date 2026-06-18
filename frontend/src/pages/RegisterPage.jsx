import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { register } from '../services/auth';

export default function RegisterPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const getErrorMessage = (err) => {
    const status = err?.response?.status;
    const detail = err?.response?.data?.detail;
    if (status === 400) {
      if (typeof detail === 'string' && detail.includes('이미')) return '이미 가입된 이메일입니다.';
      if (typeof detail === 'string') return detail;
      return '입력값을 확인해주세요.';
    }
    if (status === 422) {
      // Pydantic 유효성 검사 실패
      const msgs = Array.isArray(detail)
        ? detail.map((d) => d?.msg ?? '').filter(Boolean)
        : [];
      if (msgs.some((m) => m.toLowerCase().includes('min_length') || m.includes('4')))
        return '비밀번호는 최소 4자 이상이어야 합니다.';
      if (msgs.length > 0) return msgs[0];
      return '입력값이 올바르지 않습니다.';
    }
    return '회원가입에 실패했습니다. 잠시 후 다시 시도해주세요.';
  };

  const handleRegister = async () => {
    setError('');
    if (!email.trim()) { setError('이메일을 입력해주세요.'); return; }
    if (password.length < 4) { setError('비밀번호는 최소 4자 이상이어야 합니다.'); return; }
    setIsLoading(true);
    try {
      await register({ email, password });
      alert('회원가입이 완료되었습니다.');
      navigate('/login');
    } catch (err) {
      console.error('회원가입 실패:', err);
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
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
          />
        </label>

        <label>
          비밀번호
          <input
            type="password"
            value={password}
            onChange={(event) => { setPassword(event.target.value); setError(''); }}
            placeholder="비밀번호 (최소 4자)"
          />
          <span style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '4px', display: 'block' }}>
            영문, 숫자 포함 최소 4자 · 최대 128자
          </span>
        </label>

        {error && (
          <p style={{ color: '#f87171', fontSize: '0.85rem', margin: '4px 0' }}>{error}</p>
        )}

        <button type="button" onClick={handleRegister} disabled={isLoading}>
          {isLoading ? '가입 중...' : '회원가입'}
        </button>

        <button type="button" onClick={() => navigate('/login')}>
          로그인 하러가기
        </button>
      </div>
    </section>
  );
}