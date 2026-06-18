/**
 * FR-S-004/005 과거 수면 세션 기록 조회 + 삭제
 * - 로그인: 서버 API 사용
 * - 비로그인: IndexedDB 사용
 */
import { useCallback, useEffect, useState } from 'react';

import { deleteSession, getSessions, getSessionSpikes } from '../../services/session';
import { deleteSessionFromDB, getSessions as getLocalSessions, getSpikesBySession } from '../../services/indexedDB';
import { useAuthStore } from '../../stores/useAuthStore';
import { analyzeSleep } from '../../utils/sleepAnalysis';
import SleepAnalysisResult from './SleepAnalysisResult';

const formatDuration = (startedAt, endedAt) => {
  if (!endedAt) return '진행 중';
  const ms = new Date(endedAt) - new Date(startedAt);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
};

const formatDate = (iso) => {
  if (!iso) return '–';
  return new Date(iso).toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function SessionHistory() {
  const { isAuthenticated } = useAuthStore();
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [sessionSpikes, setSessionSpikes] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      if (isAuthenticated) {
        const data = await getSessions({ offset: 0, limit: 50 });
        setSessions(data?.sessions ?? []);
      } else {
        const local = await getLocalSessions();
        // 수면 세션만 필터
        setSessions(local.filter((s) => s.type === 'SLEEP'));
      }
    } catch (err) {
      console.error('세션 목록 조회 실패:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleSelectSession = async (session) => {
    if (selectedSession?.id === session.id) {
      setSelectedSession(null);
      setSessionSpikes([]);
      setAnalysis(null);
      return;
    }
    setSelectedSession(session);
    setAnalysis(null);

    try {
      if (isAuthenticated) {
        const data = await getSessionSpikes(session.id);
        const spikes = data?.spikes ?? [];
        setSessionSpikes(spikes);
        if (session.ended_at) {
          setAnalysis(analyzeSleep(session.started_at, session.ended_at, spikes));
        }
      } else {
        // 게스트: IndexedDB에서 스파이크 조회
        const localSpikes = await getSpikesBySession(session.id);
        setSessionSpikes(localSpikes);
        if (session.ended_at) {
          setAnalysis(analyzeSleep(session.started_at, session.ended_at, localSpikes));
        }
      }
    } catch (err) {
      console.error('세션 상세 조회 실패:', err);
    }
  };

  const handleDeleteSession = async (sessionId) => {
    if (!window.confirm('이 세션을 삭제하시겠습니까? 복구가 불가능합니다.')) return;
    setIsDeleting(true);
    try {
      if (isAuthenticated) {
        await deleteSession(sessionId);
      } else {
        await deleteSessionFromDB(sessionId);
      }
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (selectedSession?.id === sessionId) {
        setSelectedSession(null);
        setSessionSpikes([]);
        setAnalysis(null);
      }
    } catch (err) {
      console.error('세션 삭제 실패:', err);
      alert('세션 삭제에 실패했습니다.');
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="ecosense-card text-center py-10 text-zinc-400 text-sm">
        기록을 불러오는 중...
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="ecosense-card text-center py-10">
        <p className="text-zinc-400 text-sm">저장된 수면 기록이 없습니다.</p>
        {isAuthenticated ? (
          <p className="text-zinc-500 text-xs mt-2">
            게스트 모드에서 측정한 기록이 있다면 설정 → 데이터 동기화를 눌러주세요.
          </p>
        ) : (
          <p className="text-zinc-500 text-xs mt-2">
            로그인하면 다른 기기에서도 기록을 확인할 수 있습니다.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sessions.map((session) => {
        const isOpen = selectedSession?.id === session.id;
        return (
          <div
            key={session.id}
            className={`rounded-2xl border transition-all ${
              isOpen
                ? 'border-emerald-500/40 bg-emerald-950/20'
                : 'border-zinc-800 bg-zinc-900'
            }`}
          >
            {/* 세션 요약 행 */}
            <button
              type="button"
              onClick={() => handleSelectSession(session)}
              className="w-full text-left px-5 py-4 flex justify-between items-center"
            >
              <div>
                <p className="text-sm font-medium text-white">
                  {formatDate(session.started_at)}
                </p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {formatDuration(session.started_at, session.ended_at)}
                  {session.spike_count !== undefined && (
                    <span className="ml-2 text-amber-400">
                      스파이크 {session.spike_count}회
                    </span>
                  )}
                </p>
              </div>
              <span className="text-zinc-500 text-xs">{isOpen ? '▲' : '▼'}</span>
            </button>

            {/* 상세 펼침 */}
            {isOpen && (
              <div className="px-5 pb-5">
                {/* 스파이크 목록 */}
                {sessionSpikes.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs text-zinc-400 mb-2">스파이크 목록</p>
                    <div className="space-y-1.5 max-h-40 overflow-auto text-sm">
                      {sessionSpikes.map((spike) => (
                        <div
                          key={spike.id}
                          className="flex justify-between bg-zinc-950 px-3 py-2 rounded-xl"
                        >
                          <span className="font-mono text-emerald-400 text-xs">
                            {new Date(spike.detected_at).toLocaleTimeString('ko-KR')}
                          </span>
                          <span className="text-amber-400 text-xs">
                            {spike.db_level} dB · {spike.duration_sec}초
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 수면 분석 결과 */}
                {analysis && <SleepAnalysisResult result={analysis} />}

                {/* 삭제 버튼 */}
                <button
                  type="button"
                  onClick={() => handleDeleteSession(session.id)}
                  disabled={isDeleting}
                  className="w-full mt-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 py-2.5 rounded-xl text-sm disabled:opacity-50"
                >
                  이 기록 삭제
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
