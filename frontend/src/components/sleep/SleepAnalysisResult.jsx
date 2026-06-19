/**
 * FR-S-003 수면 분석 결과 컴포넌트
 */
export default function SleepAnalysisResult({ result }) {
  if (!result) return null;

  const {
    totalHours,
    totalMinutes,
    expectedCycles,
    actualCycles,
    matchRate,
    stageMinutes,
    spikesByStage,
    deepSleepSpikeCount,
    deepSleepSpikeWarning,
    spikeCount,
    peakHour,
    feedback,
  } = result;

  const fmtMin = (m) => {
    if (!m || m <= 0) return '0분';
    const h = Math.floor(m / 60);
    const min = m % 60;
    return h > 0 ? `${h}시간 ${min}분` : `${min}분`;
  };
  const pct = (m) =>
    totalMinutes > 0 ? Math.round((m / totalMinutes) * 100) : 0;

  const stages = stageMinutes
    ? [
        {
          key: 'deep',
          label: '깊은 수면 (N3)',
          min: stageMinutes.deep,
          spikes: spikesByStage?.deep ?? 0,
          bar: 'bg-indigo-500',
          text: 'text-indigo-300',
        },
        {
          key: 'light',
          label: '얕은 수면 (N1/N2)',
          min: stageMinutes.light,
          spikes: spikesByStage?.light ?? 0,
          bar: 'bg-sky-500',
          text: 'text-sky-300',
        },
        {
          key: 'rem',
          label: 'REM 수면',
          min: stageMinutes.rem,
          spikes: spikesByStage?.rem ?? 0,
          bar: 'bg-violet-500',
          text: 'text-violet-300',
        },
      ]
    : [];

  const matchColor =
    matchRate === 0
      ? 'text-emerald-400'
      : matchRate < 40
      ? 'text-emerald-400'
      : matchRate < 70
      ? 'text-yellow-400'
      : 'text-orange-400';

  const scoreRaw = Math.max(
    0,
    100 - spikeCount * 8 - (deepSleepSpikeWarning ? 15 : 0)
  );
  const score = Math.min(100, scoreRaw);
  const scoreColor =
    score >= 80 ? 'text-emerald-400' : score >= 50 ? 'text-yellow-400' : 'text-red-400';
  const scoreLabel =
    score >= 80 ? '좋음' : score >= 50 ? '보통' : '나쁨';

  return (
    <div className="ecosense-card mb-6">
      <h3 className="text-lg font-semibold mb-5 flex items-center gap-2">
        수면 분석 결과
      </h3>

      {/* 요약 그리드 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5 text-sm">
        <div className="bg-zinc-950 rounded-2xl p-4">
          <p className="text-zinc-400 text-xs mb-1">총 수면 시간</p>
          <p className="text-2xl font-mono font-bold text-white">{totalHours}h</p>
        </div>

        <div className="bg-zinc-950 rounded-2xl p-4">
          <p className="text-zinc-400 text-xs mb-1">수면 사이클 (예상)</p>
          <p className="text-2xl font-mono font-bold text-sky-400">
            {expectedCycles}
            <span className="text-sm font-normal text-zinc-400 ml-1">회</span>
          </p>
        </div>

        <div className="bg-zinc-950 rounded-2xl p-4">
          <p className="text-zinc-400 text-xs mb-1">스파이크 발생</p>
          <p className="text-2xl font-mono font-bold text-amber-400">
            {spikeCount}
            <span className="text-sm font-normal text-zinc-400 ml-1">회</span>
          </p>
        </div>

        <div className="bg-zinc-950 rounded-2xl p-4">
          <p className="text-zinc-400 text-xs mb-1">사이클 일치도</p>
          <p className={`text-2xl font-mono font-bold ${matchColor}`}>
            {matchRate}
            <span className="text-sm font-normal text-zinc-400 ml-1">%</span>
          </p>
          <p className="text-[10px] text-zinc-500 mt-1">소음이 분포된 사이클 비율</p>
        </div>

        <div className="bg-zinc-950 rounded-2xl p-4">
          <p className="text-zinc-400 text-xs mb-1">깊은수면 구간 소음</p>
          <p
            className={`text-2xl font-mono font-bold ${
              deepSleepSpikeWarning ? 'text-orange-400' : 'text-emerald-400'
            }`}
          >
            {deepSleepSpikeCount}
            <span className="text-sm font-normal text-zinc-400 ml-1">회</span>
          </p>
          <p className="text-[10px] text-zinc-500 mt-1">사이클 초반 30분 기준</p>
        </div>

        <div className="bg-zinc-950 rounded-2xl p-4">
          <p className="text-zinc-400 text-xs mb-1">수면 환경 점수</p>
          <p className={`text-2xl font-mono font-bold ${scoreColor}`}>
            {score}
            <span className="text-sm font-normal text-zinc-400 ml-1">/ 100</span>
          </p>
          <p className={`text-xs mt-1 ${scoreColor}`}>{scoreLabel}</p>
        </div>
      </div>

      {/* 추정 수면 단계 분포 (90분 사이클 통계 모델 기반) */}
      {stages.length > 0 && (
        <div className="bg-zinc-950 rounded-2xl p-4 mb-4">
          <p className="text-zinc-400 text-xs mb-3">
            추정 수면 단계 분포{' '}
            <span className="text-zinc-600">(통계 모델 기반 근사)</span>
          </p>
          <div className="space-y-3">
            {stages.map((s) => (
              <div key={s.key}>
                <div className="flex justify-between text-xs mb-1">
                  <span className={s.text}>{s.label}</span>
                  <span className="text-zinc-400">
                    {fmtMin(s.min)} · {pct(s.min)}%
                    {s.spikes > 0 && (
                      <span className="text-amber-400 ml-2">
                        소음 {s.spikes}회
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className={`h-full ${s.bar}`}
                    style={{ width: `${pct(s.min)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 주요 발생 시간대 */}
      {peakHour !== null && spikeCount > 0 && (
        <div className="bg-zinc-950 rounded-2xl p-4 mb-4 text-sm">
          <p className="text-zinc-400 text-xs mb-1">주요 소음 발생 시간대</p>
          <p className="text-white font-medium">
            오전/오후 {peakHour < 12 ? `오전 ${peakHour}시` : `오후 ${peakHour - 12 || 12}시`} 전후
          </p>
        </div>
      )}

      {/* 종합 피드백 */}
      <div className="space-y-2">
        <p className="text-xs text-zinc-400 mb-2">종합 피드백</p>
        {feedback.map((msg, i) => (
          <div
            key={i}
            className="flex gap-2 bg-zinc-950 rounded-xl p-3 text-sm text-zinc-200"
          >
            <span className="text-emerald-400 shrink-0">•</span>
            <span>{msg}</span>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-zinc-600 mt-4">
        ※ 수면 단계는 실제 뇌파 측정이 아니라 90분 사이클의 일반적 통계(깊은 수면은
        초반 사이클에, REM은 후반 사이클에 많음)에 측정 시간을 대입한 추정값입니다.
        의학적 정확도를 보장하지 않습니다.
      </p>
    </div>
  );
}
