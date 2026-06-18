import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { downloadReport, getReportHistory } from '../services/report';
import { useAuthStore } from '../stores/useAuthStore';

const formatDate = (value) => {
  if (!value) return '생성일 정보 없음';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString('ko-KR');
};

export default function ReportsPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState([]);

  const loadHistory = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      const data = await getReportHistory();
      setHistory(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('보고서 이력 조회 실패:', error);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleDownload = async (period) => {
    try {
      setIsLoading(true);

      const blob = await downloadReport(period);
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download =
        period === 'weekly'
          ? 'ecosense-weekly-report.pdf'
          : 'ecosense-monthly-report.pdf';

      link.click();
      window.URL.revokeObjectURL(url);
      await loadHistory();
    } catch (error) {
      console.error('보고서 다운로드 실패:', error);
      alert('보고서를 다운로드하지 못했습니다. 로그인 상태를 확인해 주세요.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <section className="report-page">
        <div className="report-card">
          <h2>환경 보고서</h2>
          <p>보고서 기능은 로그인 후 이용할 수 있습니다.</p>
          <button type="button" onClick={() => navigate('/login')}>
            로그인 하러가기
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="report-page">
      <div className="report-card">
        <h2>환경 보고서</h2>

        <p>
          주간 또는 월간 환경 데이터를 PDF 형식으로 다운로드할 수 있습니다.
        </p>

        <div className="report-actions">
          <button
            type="button"
            onClick={() => handleDownload('weekly')}
            disabled={isLoading}
          >
            주간 보고서 다운로드
          </button>

          <button
            type="button"
            onClick={() => handleDownload('monthly')}
            disabled={isLoading}
          >
            월간 보고서 다운로드
          </button>
        </div>

        {isLoading && (
          <p className="report-loading">
            보고서를 생성하는 중입니다...
          </p>
        )}

        <div className="report-history">
          <h3>보고서 생성 이력</h3>

          {history.length === 0 ? (
            <p>아직 생성된 보고서 이력이 없습니다.</p>
          ) : (
            <ul>
              {history.map((item) => (
                <li key={item.id}>
                  {item.period === 'weekly' ? '주간' : '월간'}
                  {' - '}
                  {formatDate(item.created_at)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}