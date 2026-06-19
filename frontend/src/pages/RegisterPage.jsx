import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { register, verifyEmail, resendVerify } from '../services/auth';

export default function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();

  // 로그인 페이지에서 미인증 403으로 넘어올 때 이메일·단계 인계
  const initEmail = location.state?.email || '';
  const initStep = location.state?.gotoVerify ? 'verify' : 'form';

  const [step, setStep] = useState(initStep);
  const [email, setEmail] = useState(initEmail);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const passwordMismatch = passwordConfirm.length > 0 && password !== passwordConfirm;

  const handlePhoneChange = (value) => {
    setPhone(value.replace(/\D/g, '').slice(0, 11));
  };

  const handleRegister = async () => {
    setError('');
    if (!name.trim()) { setError('이름을 입력해주세요.'); return; }
    if (!email.trim()) { setError('이메일을 입력해주세요.'); return; }
    if (password.length < 8) { setError('비밀번호는 최소 8자 이상이어야 합니다.'); return; }
    if (password !== passwordConfirm) { setError('비밀번호가 일치하지 않습니다.'); return; }
    setIsLoading(true);
    try {
      await register({ email, password, name, phone: phone || undefined });
      setStep('verify');
    } catch (err) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 409) {
        setError(typeof detail === 'string' ? detail : '이미 등록된 이메일입니다.');
      } else if (status === 503) {
        setStep('verify');
        setError(
          typeof detail === 'string'
            ? detail
            : '메일 발송에 실패했습니다. 아래에서 인증코드 재발송을 시도해주세요.'
        );
      } else {
        setError('회원가입에 실패했습니다. 다시 시도해주세요.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async () => {
    setError('');
    if (!code.trim()) { setError('인증코드를 입력해주세요.'); return; }
    setIsLoading(true);
    try {
      await verifyEmail(email, code);
      alert('이메일 인증이 완료되었습니다!');
      navigate('/login');
    } catch (err) {
      setError('인증코드가 올바르지 않거나 만료되었습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    try {
      await resendVerify(email);
      alert('인증코드가 재발송되었습니다.');
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(
        typeof detail === 'string' ? detail : '인증코드 재발송에 실패했습니다.'
      );
    }
  };

  // 인증코드 입력 화면
  if (step === 'verify') {
    return (
      <section className="login-page">
        <div className="login-card">
          <h1>EcoSense</h1>
          <p style={{ fontSize: '0.9rem', color: '#52525b', marginBottom: '12px' }}>
            <b>{email}</b>로 인증코드를 발송했습니다.
          </p>
          <label>
            인증코드
            <input
              value={code}
              onChange={(e) => { setCode(e.target.value); setError(''); }}
              placeholder="6자리 인증코드"
              maxLength={6}
              onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
            />
          </label>
          {error && <p style={{ color: '#f87171', fontSize: '0.85rem', margin: '4px 0' }}>{error}</p>}
          <button type="button" onClick={handleVerify} disabled={isLoading}>
            {isLoading ? '확인 중...' : '인증 완료'}
          </button>
          <button
            type="button"
            onClick={handleResend}
            style={{ background: 'none', color: '#2e7d5e', border: '1px solid #2e7d5e' }}
          >
            인증코드 재발송
          </button>
          <button type="button" onClick={() => setStep('form')}>
            이전으로
          </button>
        </div>
      </section>
    );
  }

  // 회원가입 입력 화면
  return (
    <section className="login-page">
      <div className="login-card">
        <h1>EcoSense</h1>

        <label>
          이름
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="이름"
          />
        </label>

        <label>
          전화번호 (선택)
          <input
            value={phone}
            onChange={(e) => handlePhoneChange(e.target.value)}
            placeholder="01012345678"
            inputMode="numeric"
            autoComplete="tel"
            maxLength={11}
          />
        </label>

        <label>
          이메일 (로그인 아이디)
          <input
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(''); }}
            placeholder="이메일 (로그인 시 사용)"
            type="email"
          />
        </label>

        <label>
          비밀번호
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(''); }}
            placeholder="비밀번호 (8자 이상)"
          />
        </label>

        <label>
          비밀번호 확인
          <input
            type="password"
            value={passwordConfirm}
            onChange={(e) => { setPasswordConfirm(e.target.value); setError(''); }}
            placeholder="비밀번호 확인"
            style={{ borderColor: passwordMismatch ? '#ef4444' : '' }}
          />
          {passwordMismatch && (
            <span style={{ fontSize: '0.8rem', color: '#ef4444', marginTop: '4px', display: 'block' }}>
              비밀번호가 다릅니다.
            </span>
          )}
        </label>

        {error && <p style={{ color: '#f87171', fontSize: '0.85rem', margin: '4px 0' }}>{error}</p>}

        <button type="button" onClick={handleRegister} disabled={isLoading}>
          {isLoading ? '처리 중...' : '인증코드 발송'}
        </button>

        <button type="button" onClick={() => navigate('/login')}>
          로그인 하러가기
        </button>
      </div>
    </section>
  );
}
