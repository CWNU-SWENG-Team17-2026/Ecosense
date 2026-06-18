/**
 * FR-S-003 수면 분석 결과 컴포넌트
 */
export default function SleepAnalysisResult({ result }) {
  if (!result) return null;

  const {
    totalHours,
    expectedCycles,
    actualCycles,
    matchRate,
    deepSleepSpikeCount,
    deepSleepSpikeWarning,
    spikeCount,
    peakHour,
    feedback,
  } = result;

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
        ※ 수면 사이클 추정은 휴리스틱 기반 근사값으로, 의학적 정확도를 보장하지 않습니다.
      </p>
    </div>
  );
}
