import { useEffect, useState } from 'react';

import NoiseChart from '../components/charts/NoiseChart';
import SessionHistory from '../components/sleep/SessionHistory';
import SleepAnalysisResult from '../components/sleep/SleepAnalysisResult';
import { useAudio } from '../hooks/useAudio';
import { useSync } from '../hooks/useSync';
import { clearSpikes, getRecordings, getSpikes } from '../services/indexedDB';
import { useNoiseStore } from '../stores/useNoiseStore';
import { getNoiseComment } from '../utils/comment';
import { analyzeSleep } from '../utils/sleepAnalysis';

export default function SleepPage() {
  const [activeTab, setActiveTab] = useState('measure');

  const {
    mode,
    spikes,
    sessionId,
    sessionStartTime,
    setMode,
    clearCurrentSpikes,
    clearSpikes: clearStoreSpikes,
  } = useNoiseStore();

  const {
    currentDb,
    backgroundDb,
    isMeasuring,
    isSpiking,
    startAudioMonitoring,
    stopAudioMonitoring,
  } = useAudio();

  const { uploadToServer } = useSync();
  const [savedSpikes, setSavedSpikes] = useState([]);
  const [recordings, setRecordings] = useState([]);
  const [analysisResult, setAnalysisResult] = useState(null);

  useEffect(() => {
    const loadStoredData = async () => {
      try {
        const [loadedSpikes, loadedRecordings] = await Promise.all([
          getSpikes(),
          getRecordings(),
        ]);
        setSavedSpikes(loadedSpikes);
        setRecordings(loadedRecordings);
      } catch (error) {
        console.error('스파이크 조회 실패:', error);
      }
    };

    loadStoredData();
  }, [spikes.length]);

  const handleStop = async () => {
  stopAudioMonitoring();

  // 녹음 종료/스파이크 저장이 반영될 시간
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const latestSpikes = useNoiseStore.getState().spikes;
    if (mode === 'sleep' && sessionStartTime) {
      const endedAt = new Date().toISOString();
      const result = analyzeSleep(sessionStartTime, endedAt, latestSpikes);
      setAnalysisResult(result);
    }

    await uploadToServer();

    const [loadedSpikes, loadedRecordings] = await Promise.all([
      getSpikes(),
      getRecordings(),
    ]);

    setSavedSpikes(loadedSpikes);
    setRecordings(loadedRecordings);
  };

  const handleClearSpikes = async () => {
    try {
      await clearSpikes();
      clearStoreSpikes();
      clearCurrentSpikes();
      setSavedSpikes([]);
      setRecordings([]);
      setAnalysisResult(null);
      alert('저장된 이상 소음 기록을 초기화했습니다.');
    } catch (error) {
      console.error('스파이크 초기화 실패:', error);
      alert('이상 소음 기록 초기화에 실패했습니다.');
    }
  };

  const totalSpikes = spikes.length;
  const avgDb =
    totalSpikes > 0
      ? (
          spikes.reduce((sum, spike) => sum + spike.db_level, 0) / totalSpikes
        ).toFixed(1)
      : null;

  const displayDb =
    currentDb === -Infinity || !isFinite(currentDb)
      ? null
      : Math.max(0, Math.min(100, currentDb + 100));

  return (
    <section className="sleep-page p-6 max-w-2xl mx-auto text-white">
      <h1 className="text-3xl font-bold mb-5">수면 / 소음 측정</h1>

      {/* 탭 헤더 */}
      <div className="flex gap-1 mb-6 bg-zinc-900 p-1 rounded-2xl">
        <button
          type="button"
          onClick={() => setActiveTab('measure')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
            activeTab === 'measure'
              ? 'bg-emerald-500 text-white'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          측정
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
            activeTab === 'history'
              ? 'bg-emerald-500 text-white'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          기록
        </button>
      </div>

      {/* 기록 탭 */}
      {activeTab === 'history' && <SessionHistory />}

      {/* 측정 탭 */}
      {activeTab === 'measure' && <>

      <div
        className={`rounded-3xl p-6 mb-6 ${
          isMeasuring
            ? 'bg-emerald-950/60 border border-emerald-500/40'
            : 'bg-zinc-900 border border-zinc-800'
        }`}
      >
        <h2 className="text-lg mb-4">소음 변화 그래프</h2>
        <NoiseChart />

        <div className="grid grid-cols-2 gap-4 mt-6">
          <div className="bg-zinc-950 rounded-2xl p-4">
            <p className="text-sm text-zinc-400">현재 소음</p>
            <p className="text-4xl font-mono text-emerald-400 mt-1">
              {displayDb === null ? '--' : `${displayDb.toFixed(1)}`}
              <span className="text-lg ml-1">dB</span>
            </p>
            <p className="text-xs text-zinc-500 mt-2">
              {displayDb === null
                ? '마이크 권한 허용 후 실시간 소음이 표시됩니다.'
                : getNoiseComment(displayDb)}
            </p>
          </div>

          <div className="bg-zinc-950 rounded-2xl p-4">
            <p className="text-sm text-zinc-400">배경 소음</p>
            <p className="text-4xl font-mono text-zinc-400 mt-1">
              {Math.max(0, backgroundDb + 100).toFixed(1)}
              <span className="text-lg ml-1">dB</span>
            </p>
          </div>
        </div>
      </div>

      <div className="ecosense-card mb-6">
        <h3 className="text-lg font-semibold mb-4">측정 제어</h3>

        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setMode('normal')}
            disabled={isMeasuring}
            className={`flex-1 py-3 rounded-2xl ${
              mode === 'normal'
                ? 'bg-emerald-500 text-white'
                : 'bg-zinc-800 text-zinc-400'
            }`}
          >
            일반 소음 측정
          </button>
          <button
            type="button"
            onClick={() => setMode('sleep')}
            disabled={isMeasuring}
            className={`flex-1 py-3 rounded-2xl ${
              mode === 'sleep'
                ? 'bg-emerald-500 text-white'
                : 'bg-zinc-800 text-zinc-400'
            }`}
          >
            수면 소음 측정
          </button>
        </div>

        {!isMeasuring ? (
          <button
            type="button"
            onClick={startAudioMonitoring}
            className="w-full btn-primary text-lg py-5"
          >
            {mode === 'normal' ? '일반 소음 측정 시작' : '수면 소음 측정 시작'}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleStop}
            className="w-full bg-red-500 hover:bg-red-600 text-white py-5 rounded-2xl text-lg"
          >
            {mode === 'normal' ? '일반 소음 측정 종료' : '수면 소음 측정 종료'}
          </button>
        )}

        {isSpiking && (
          <p className="text-amber-400 text-sm text-center mt-4">
            스파이크 감지 중... (자동 녹음 중)
          </p>
        )}
      </div>

      {/* FR-S-003 수면 분석 결과 - 측정 종료 직후 바로 표시 */}
      {analysisResult && !isMeasuring && mode === 'sleep' && (
        <SleepAnalysisResult result={analysisResult} />
      )}

      <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
        <div className="bg-zinc-900 rounded-2xl p-4">
          <p className="text-zinc-400 text-xs">세션 ID</p>
          <p className="font-mono text-emerald-300 mt-1 break-all">
            {sessionId || '없음'}
          </p>
        </div>
        <div className="bg-zinc-900 rounded-2xl p-4">
          <p className="text-zinc-400 text-xs">감지된 스파이크</p>
          <p className="text-4xl font-medium mt-1">{totalSpikes}</p>
          {avgDb && (
            <p className="text-xs text-zinc-400 mt-1">평균 {avgDb} dB</p>
          )}
        </div>
      </div>

      {spikes.length > 0 && (
        <div className="ecosense-card mb-6">
          <h3 className="text-sm text-zinc-400 mb-3">이번 세션 스파이크</h3>
          <div className="space-y-2 max-h-48 overflow-auto text-sm">
            {spikes
              .slice()
              .reverse()
              .map((spike) => (
                <div
                  key={spike.id}
                  className="flex justify-between bg-zinc-950 px-4 py-2 rounded-xl"
                >
                  <span className="font-mono text-emerald-400">
                    {new Date(spike.detected_at).toLocaleTimeString('ko-KR')}
                  </span>
                  <span className="text-amber-400">
                    {spike.db_level} dB / {spike.duration_sec}초
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="ecosense-card mb-6">
        <h3 className="text-sm text-zinc-400 mb-3">저장된 스파이크 기록</h3>
        {savedSpikes.length === 0 ? (
          <p className="text-sm text-zinc-500">저장된 기록이 없습니다.</p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-auto text-sm">
            {savedSpikes.map((spike) => (
              <div
                key={spike.id}
                className="flex justify-between bg-zinc-950 px-4 py-2 rounded-xl"
              >
                <span className="font-mono text-emerald-400">
                  {new Date(spike.detected_at).toLocaleTimeString('ko-KR')}
                </span>
                <span className="text-amber-400">{spike.db_level} dB</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="ecosense-card mb-6">
        <h3 className="text-sm text-zinc-400 mb-3">녹음 파일 목록</h3>
        {recordings.length === 0 ? (
          <p className="text-sm text-zinc-500">저장된 녹음 파일이 없습니다.</p>
        ) : (
          <div className="space-y-3 max-h-64 overflow-auto text-sm">
            {recordings.map((recording) => (
              <div
                key={recording.id}
                className="bg-zinc-950 px-4 py-3 rounded-xl border border-zinc-800"
              >
                <p className="text-zinc-300 mb-2">
                  {new Date(recording.detected_at).toLocaleString('ko-KR')}
                  {' · '}
                  <span className="text-amber-400">{recording.db_level} dB</span>
                  {' · '}
                  {recording.duration_sec}초
                </p>
                <audio
                  controls
                  className="w-full"
                  src={URL.createObjectURL(recording.blob)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={handleClearSpikes}
        className="w-full bg-zinc-800 hover:bg-zinc-700 text-white py-4 rounded-2xl"
      >
        이상 소음 기록 초기화
      </button>

      </>}
    </section>
  );
}