/**
 * FR-S-003 수면 측정 분석 (휴리스틱 기반)
 * SRS 요구사항:
 * (1) 총 수면 시간 + 대략적 수면 사이클 횟수
 * (2) 예상 사이클 대비 실제 감지 사이클 일치도
 * (3) 깊은 수면 구간으로 추정되는 시간대에 스파이크가 많이 발생했는지
 * (4) 전체 스파이크 횟수 및 주요 발생 시간대
 * (5) 종합 수면 환경 피드백
 *
 * 주의: 본 분석은 실제 뇌파/움직임 센싱이 아니라 "시간대 기반 수면 단계 통계 모델"에
 * 소음 스파이크를 매핑하는 휴리스틱이다. 의학적 정확도를 보장하지 않는다.
 */

/** 단일 수면 사이클 ≈ 90분 */
const CYCLE_MINUTES = 90;

/** 입면(잠드는) 구간 추정 시간(분) */
const SLEEP_ONSET_MINUTES = 10;

/**
 * 일반적인 수면 구조 통계 모델.
 *
 * 한 사이클(≈90분)은 N1/N2(얕은 수면) → N3(깊은 수면) → REM 순으로 진행되며,
 * 밤이 깊어질수록(=사이클 index가 커질수록):
 *   - 깊은 수면(N3) 비중은 줄어들고
 *   - REM 비중은 늘어난다.
 *
 * cycleIndex(0부터)에 따라 한 사이클 내 단계별 시간(분)을 근사한다.
 *
 * @param {number} cycleIndex
 * @returns {{deep:number, rem:number, light:number}}
 */
function estimateCycleStageMinutes(cycleIndex) {
  // 깊은 수면: 첫 사이클 ~25분, 이후 사이클마다 감소
  const deep = Math.max(0, 25 - cycleIndex * 8);
  // REM: 첫 사이클 ~10분, 이후 사이클마다 증가 (최대 35분)
  const rem = Math.min(35, 10 + cycleIndex * 8);
  // 나머지는 얕은 수면(N1/N2)
  const light = Math.max(0, CYCLE_MINUTES - deep - rem);
  return { deep, rem, light };
}

/**
 * 전체 수면 시간에 대한 추정 수면 단계 타임라인(hypnogram)을 만든다.
 * 각 세그먼트는 { startMin, endMin, stage } 형태이며 stage ∈ {'light','deep','rem'}.
 *
 * @param {number} totalMinutes
 * @returns {Array<{startMin:number, endMin:number, stage:string}>}
 */
function buildHypnogram(totalMinutes) {
  const segments = [];
  let cursor = 0;
  let cycleIndex = 0;

  // 입면 구간: 얕은 수면으로 간주
  if (totalMinutes > 0) {
    const onsetEnd = Math.min(SLEEP_ONSET_MINUTES, totalMinutes);
    segments.push({ startMin: 0, endMin: onsetEnd, stage: 'light' });
    cursor = onsetEnd;
  }

  while (cursor < totalMinutes) {
    const { deep, rem, light } = estimateCycleStageMinutes(cycleIndex);

    // 사이클 내 순서: 얕은 수면 → 깊은 수면 → 얕은 수면 → REM
    const order = [
      { stage: 'light', dur: light / 2 },
      { stage: 'deep', dur: deep },
      { stage: 'light', dur: light / 2 },
      { stage: 'rem', dur: rem },
    ];

    for (const part of order) {
      if (cursor >= totalMinutes) break;
      if (part.dur <= 0) continue;
      const end = Math.min(cursor + part.dur, totalMinutes);
      segments.push({ startMin: cursor, endMin: end, stage: part.stage });
      cursor = end;
    }

    cycleIndex += 1;
  }

  return segments;
}

/** 특정 경과 시간(분)이 속한 추정 수면 단계 */
function stageAt(hypnogram, offsetMin) {
  for (const seg of hypnogram) {
    if (offsetMin >= seg.startMin && offsetMin < seg.endMin) return seg.stage;
  }
  return 'light';
}

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

  // 추정 수면 단계 타임라인
  const hypnogram = buildHypnogram(totalMinutes);

  // 단계별 추정 시간(분) 집계
  const stageMinutes = { light: 0, deep: 0, rem: 0 };
  for (const seg of hypnogram) {
    stageMinutes[seg.stage] += seg.endMin - seg.startMin;
  }
  Object.keys(stageMinutes).forEach((k) => {
    stageMinutes[k] = Math.round(stageMinutes[k]);
  });

  // (2) 각 사이클별 스파이크 분포로 일치도 계산
  const cycleHasSpike = Array.from(
    { length: Math.max(expectedCycles, 1) },
    (_, i) => {
      const cycleStart = start + i * CYCLE_MINUTES * 60000;
      const cycleEnd = cycleStart + CYCLE_MINUTES * 60000;
      return spikes.some((s) => {
        const t = new Date(s.detected_at).getTime();
        return t >= cycleStart && t < cycleEnd;
      });
    }
  );
  const cyclesWithSpike = cycleHasSpike.filter(Boolean).length;
  const matchRate =
    expectedCycles > 0
      ? Math.round((cyclesWithSpike / expectedCycles) * 100)
      : 0;

  // (3) 추정 수면 단계별 스파이크 분포
  const spikesByStage = { light: 0, deep: 0, rem: 0 };
  for (const s of spikes) {
    const t = new Date(s.detected_at).getTime();
    const offsetMin = (t - start) / 60000;
    if (offsetMin < 0 || offsetMin > totalMinutes) continue;
    const stage = stageAt(hypnogram, offsetMin);
    spikesByStage[stage] += 1;
  }
  const deepSleepSpikeCount = spikesByStage.deep;
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
    spikesByStage,
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
    stageMinutes,
    spikesByStage,
    deepSleepSpikeCount,
    deepSleepSpikeWarning,
    spikeCount: spikes.length,
    peakHour,
    feedback,
  };
}

function buildFeedback({
  totalMinutes,
  spikeCount,
  spikesByStage,
  matchRate,
  expectedCycles,
}) {
  const messages = [];

  if (totalMinutes < 240) {
    messages.push('수면 시간이 4시간 미만입니다. 충분한 수면을 권장합니다.');
  } else if (totalMinutes < 360) {
    messages.push('수면 시간이 다소 부족합니다. 7~8시간을 목표로 해보세요.');
  } else if (totalMinutes >= 420 && totalMinutes <= 540) {
    messages.push('수면 시간이 적절합니다.');
  } else if (totalMinutes > 540) {
    messages.push(
      '수면 시간이 9시간을 초과했습니다. 과수면도 피로감의 원인이 될 수 있습니다.'
    );
  }

  if (spikeCount === 0) {
    messages.push(
      '수면 중 소음 스파이크가 감지되지 않았습니다. 조용한 수면 환경이었네요!'
    );
  } else if (spikeCount <= 3) {
    messages.push(
      `수면 중 ${spikeCount}회의 소음이 감지되었습니다. 비교적 안정적인 수면이었습니다.`
    );
  } else if (spikeCount <= 8) {
    messages.push(
      `${spikeCount}회의 소음 이벤트가 감지되었습니다. 수면이 다소 방해받았을 수 있습니다.`
    );
  } else {
    messages.push(
      `${spikeCount}회의 잦은 소음 이벤트가 감지되었습니다. 수면 환경 개선이 필요합니다.`
    );
  }

  if (spikesByStage.deep > 0) {
    messages.push(
      `깊은 수면(N3) 추정 구간에서 ${spikesByStage.deep}회의 소음이 발생했습니다. 깊은 수면은 가장 회복에 중요한 단계로, 수면 질에 영향을 줬을 수 있습니다.`
    );
  }
  if (spikesByStage.rem > 0) {
    messages.push(
      `REM 수면 추정 구간에서 ${spikesByStage.rem}회의 소음이 발생했습니다. REM 단계는 꿈·기억 정리와 관련이 있습니다.`
    );
  }

  if (expectedCycles > 0 && matchRate < 30) {
    messages.push('소음이 특정 수면 사이클에만 집중되어 있습니다.');
  } else if (expectedCycles > 0 && matchRate >= 70) {
    messages.push('소음이 여러 수면 사이클에 걸쳐 고르게 분포되어 있습니다.');
  }

  return messages;
}
