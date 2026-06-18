import { useNavigate } from 'react-router-dom';

export default function StartPage() {
  const navigate = useNavigate();

  return (
    <section className="start-page">
      <div className="start-card">
        <img src="/images/logo.png" alt="EcoSense" className="start-logo" />

        <div className="start-actions">
          <button type="button" onClick={() => navigate('/login')}>
            <img src="/images/login.png" alt="로그인" />
          </button>

          <button onClick={() => navigate('/register')}>
            <img src="/images/register.png" alt="회원가입" />
          </button>

          <button type="button" onClick={() => navigate('/main')}>
            <img src="/images/guest.png" alt="게스트 모드" />
          </button>
        </div>
      </div>
    </section>
  );
}