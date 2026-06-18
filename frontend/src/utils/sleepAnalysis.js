/**
 * FR-S-003 수면 측정 분석 (휴리스틱 기반)
 * SRS 요구사항:
 * (1) 총 수면 시간 + 대략적 수면 사이클 횟수
 * (2) 예상 사이클 대비 실제 감지 사이클 일치도
 * (3) 깊은 수면 구간으로 추정되는 시간대에 스파이크가 많이 발생했는지
 * (4) 전체 스파이크 횟수 및 주요 발생 시간대
 * (5) 종합 수면 환경 피드백
 */

/** 단일 수면 사이클 ≈ 90분 */
const CYCLE_MINUTES = 90;

/**
 * @param {string} startedAt - ISO 8601
 * @param {string} endedAt   - ISO 8601
 * @param {Array<{detected_at: string, db_level: number, duration_sec: number}>} spikes
 * @returns {object} 분석 결과
 */
export function analyzeSleep(startedAt, endedAt, spikes) {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  const totalMs = end - start;
  const totalMinutes = Math.round(totalMs / 60000);
  const totalHours = (totalMs / 3600000).toFixed(1);

  // (1) 수면 사이클 횟수
  const expectedCycles = Math.floor(totalMinutes / CYCLE_MINUTES);
  const actualCycles = Math.max(0, expectedCycles);

  // (2) 각 사이클별 스파이크 분포로 일치도 계산
  // 각 사이클 구간에 스파이크가 얼마나 퍼져 있는지 확인
  const cycleHasSpike = Array.from({ length: Math.max(expectedCycles, 1) }, (_, i) => {
    const cycleStart = start + i * CYCLE_MINUTES * 60000;
    const cycleEnd = cycleStart + CYCLE_MINUTES * 60000;
    return spikes.some((s) => {
      const t = new Date(s.detected_at).getTime();
      return t >= cycleStart && t < cycleEnd;
    });
  });
  const cyclesWithSpike = cycleHasSpike.filter(Boolean).length;
  const matchRate =
    expectedCycles > 0 ? Math.round((cyclesWithSpike / expectedCycles) * 100) : 0;

  // (3) 깊은 수면 구간 (각 사이클의 후반 30분) 스파이크 여부
  // NREM 깊은 수면은 보통 사이클 초반에 많음(단순 휴리스틱으로 '초반 30분'을 깊은 수면으로 간주)
  const deepSleepSpikeCount = spikes.filter((s) => {
    const t = new Date(s.detected_at).getTime();
    const offsetMin = (t - start) / 60000;
    const posInCycle = offsetMin % CYCLE_MINUTES;
    return posInCycle < 30; // 각 사이클의 첫 30분 = 깊은 수면 추정 구간
  }).length;
  const deepSleepSpikeWarning = deepSleepSpikeCount > 0;

  // (4) 주요 발생 시간대
  const spikeTimestamps = spikes.map((s) => new Date(s.detected_at));
  const hourCounts = {};
  for (const t of spikeTimestamps) {
    const h = t.getHours();
    hourCounts[h] = (hourCounts[h] || 0) + 1;
  }
  const peakHour =
    Object.keys(hourCounts).length > 0
      ? Number(Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0][0])
      : null;

  // (5) 종합 피드백
  const feedback = buildFeedback({
    totalMinutes,
    spikeCount: spikes.length,
    deepSleepSpikeWarning,
    matchRate,
    expectedCycles,
  });

  return {
    totalMinutes,
    totalHours,
    expectedCycles,
    actualCycles,
    cyclesWithSpike,
    matchRate,
    deepSleepSpikeCount,
    deepSleepSpikeWarning,
    spikeCount: spikes.length,
    peakHour,
    feedback,
  };
}

function buildFeedback({ totalMinutes, spikeCount, deepSleepSpikeWarning, matchRate, expectedCycles }) {
  const messages = [];

  if (totalMinutes < 240) {
    messages.push('수면 시간이 4시간 미만입니다. 충분한 수면을 권장합니다.');
  } else if (totalMinutes < 360) {
    messages.push('수면 시간이 다소 부족합니다. 7~8시간을 목표로 해보세요.');
  } else if (totalMinutes >= 420 && totalMinutes <= 540) {
    messages.push('수면 시간이 적절합니다.');
  } else if (totalMinutes > 540) {
    messages.push('수면 시간이 9시간을 초과했습니다. 과수면도 피로감의 원인이 될 수 있습니다.');
  }

  if (spikeCount === 0) {
    messages.push('수면 중 소음 스파이크가 감지되지 않았습니다. 조용한 수면 환경이었네요!');
  } else if (spikeCount <= 3) {
    messages.push(`수면 중 ${spikeCount}회의 소음이 감지되었습니다. 비교적 안정적인 수면이었습니다.`);
  } else if (spikeCount <= 8) {
    messages.push(`${spikeCount}회의 소음 이벤트가 감지되었습니다. 수면이 다소 방해받았을 수 있습니다.`);
  } else {
    messages.push(`${spikeCount}회의 잦은 소음 이벤트가 감지되었습니다. 수면 환경 개선이 필요합니다.`);
  }

  if (deepSleepSpikeWarning) {
    messages.push('깊은 수면 추정 구간(사이클 초반 30분)에 소음이 발생했습니다. 수면 질에 영향을 줬을 수 있습니다.');
  }

  if (expectedCycles > 0 && matchRate < 30) {
    messages.push('소음이 특정 수면 사이클에만 집중되어 있습니다.');
  } else if (expectedCycles > 0 && matchRate >= 70) {
    messages.push('소음이 여러 수면 사이클에 걸쳐 고르게 분포되어 있습니다.');
  }

  return messages;
}
