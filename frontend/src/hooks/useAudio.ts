import { useState, useRef, useCallback, useEffect } from 'react';

import { saveSpikeWithBlob, cleanupExpiredSpikes, saveSession } from '../services/indexedDB';
import { useNoiseStore } from '../stores/useNoiseStore';

const CHART_UPDATE_INTERVAL_MS = 500;

// 스파이크 종료 판정: 종료 임계값 이하가 이 시간만큼 연속되면 녹음 종료
const SPIKE_END_QUIET_MS = 1000;

// 측정 시작 직후 실제 환경 소음을 학습하는 캘리브레이션 구간
const CALIBRATION_MS = 3000;

// 스파이크 판정 히스테리시스 (배경 대비 offset, dB)
//  - 시작: 배경 + 15dB 초과
//  - 종료: 배경 + 8dB 이하 (시작보다 낮게 두어 임계값 근처 떨림으로 인한 무한 녹음 방지)
const SPIKE_START_OFFSET = 15;
const SPIKE_END_OFFSET = 8;

// 배경 소음 적응 속도 (지수 평활 계수)
//  - 상승은 천천히(지속 소음만 반영), 하강은 비교적 빠르게
const BG_RISE_ALPHA = 0.02;
const BG_FALL_ALPHA = 0.1;

// 캘리브레이션 전 임시 초기값
const INITIAL_BG = -65;

export const useAudio = () => {
  const [currentDb, setCurrentDb] = useState(-Infinity);
  const [backgroundDb, setBackgroundDb] = useState(INITIAL_BG);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [isSpiking, setIsSpiking] = useState(false);

  const {
    mode,
    setCurrentDb: storeSetCurrentDb,
    setBackgroundDb: storeSetBackgroundDb,
    addSpike,
    sessionId,
    setIsSpiking: storeSetIsSpiking,
    setIsMeasuring: storeSetIsMeasuring,
    startNewSession,
    endCurrentSession,
  } = useNoiseStore();

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const dataArrayRef = useRef<Float32Array | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const spikeStartTimeRef = useRef<number | null>(null);
  const spikeQuietStartRef = useRef<number | null>(null);
  const spikePeakDbRef = useRef<number>(-Infinity);
  const chunksRef = useRef<Blob[]>([]);
  const latestDbRef = useRef<number>(-Infinity);
  const lastChartUpdateRef = useRef(0);
  const lastBgDisplayRef = useRef(0);
  const isMeasuringRef = useRef(false);
  const modeRef = useRef(mode);

  // 루프 내부에서 항상 최신 값을 읽기 위한 ref (state 클로저 고착 방지)
  const backgroundDbRef = useRef<number>(INITIAL_BG);
  const sessionIdRef = useRef<string | null>(sessionId);
  const isCalibratingRef = useRef(false);
  const calibrationStartRef = useRef<number | null>(null);
  const calibrationSumRef = useRef(0);
  const calibrationCountRef = useRef(0);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const calculateDb = useCallback((analyser: AnalyserNode): number => {
    if (!dataArrayRef.current) return -Infinity;

    analyser.getFloatTimeDomainData(
      dataArrayRef.current as Float32Array<ArrayBuffer>
    );

    let sum = 0;
    for (let i = 0; i < dataArrayRef.current.length; i++) {
      sum += dataArrayRef.current[i] * dataArrayRef.current[i];
    }

    const rms = Math.sqrt(sum / dataArrayRef.current.length);
    return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
  }, []);

  // 배경 소음 적응 갱신. 스파이크 구간(배경+시작임계값 초과)은 배경을 끌어올리지 않도록 제외.
  const updateBackgroundDb = useCallback(
    (current: number) => {
      if (!isFinite(current) || current < -100) return;

      const bg = backgroundDbRef.current;
      if (current >= bg + SPIKE_START_OFFSET) return;

      const alpha = current > bg ? BG_RISE_ALPHA : BG_FALL_ALPHA;
      const newBg = bg + (current - bg) * alpha;
      backgroundDbRef.current = newBg;

      const now = Date.now();
      if (now - lastBgDisplayRef.current >= CHART_UPDATE_INTERVAL_MS) {
        setBackgroundDb(newBg);
        storeSetBackgroundDb(newBg);
        lastBgDisplayRef.current = now;
      }
    },
    [storeSetBackgroundDb]
  );

  const cleanupRecorder = useCallback(() => {
    mediaRecorderRef.current = null;
    spikeStartTimeRef.current = null;
    spikeQuietStartRef.current = null;
    spikePeakDbRef.current = -Infinity;
    chunksRef.current = [];
  }, []);

  const startSpikeRecording = useCallback(() => {
    if (!streamRef.current || mediaRecorderRef.current) return;

    const recorder = new MediaRecorder(streamRef.current, {
      mimeType: 'audio/webm;codecs=opus',
    });

    mediaRecorderRef.current = recorder;
    chunksRef.current = [];
    spikeStartTimeRef.current = Date.now();
    spikeQuietStartRef.current = null;
    spikePeakDbRef.current = latestDbRef.current;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      const durationSec =
        (Date.now() - (spikeStartTimeRef.current ?? 0)) / 1000;

      if (durationSec < 1 || chunksRef.current.length === 0) {
        cleanupRecorder();
        return;
      }

      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });

      const spike = {
        id: crypto.randomUUID(),
        session_id: sessionIdRef.current ?? crypto.randomUUID(),
        detected_at: new Date().toISOString(),
        db_level: Math.round(spikePeakDbRef.current),
        duration_sec: Math.round(durationSec),
      };

      await saveSpikeWithBlob(spike, blob);
      addSpike(spike);
      cleanupRecorder();
    };

    recorder.start(1000);
  }, [addSpike, cleanupRecorder]);

  const checkForSpike = useCallback(
    (current: number, now: number) => {
      if (modeRef.current !== 'sleep') return;

      const bg = backgroundDbRef.current;
      const startThreshold = bg + SPIKE_START_OFFSET;
      const endThreshold = bg + SPIKE_END_OFFSET;

      // 녹음 중이 아니면: 시작 임계값 초과 시 녹음 시작
      if (!mediaRecorderRef.current) {
        if (current > startThreshold) {
          setIsSpiking(true);
          storeSetIsSpiking(true);
          latestDbRef.current = current;
          startSpikeRecording();
        }
        return;
      }

      // stop() 호출 후 onstop 처리 대기 중에는 추가 동작하지 않음
      if (mediaRecorderRef.current.state !== 'recording') return;

      // 녹음 중: 피크 추적
      if (current > spikePeakDbRef.current) spikePeakDbRef.current = current;

      // 종료 임계값 초과면 여전히 시끄러운 상태 → 조용 타이머 리셋
      if (current > endThreshold) {
        spikeQuietStartRef.current = null;
        return;
      }

      // 종료 임계값 이하: 조용 지속 시간 측정
      if (spikeQuietStartRef.current === null) {
        spikeQuietStartRef.current = now;
      }

      if (now - spikeQuietStartRef.current >= SPIKE_END_QUIET_MS) {
        mediaRecorderRef.current.stop();
        setIsSpiking(false);
        storeSetIsSpiking(false);
        spikeQuietStartRef.current = null;
      }
    },
    [startSpikeRecording, storeSetIsSpiking]
  );

  const monitoringLoop = useCallback(() => {
    if (!analyserRef.current || !isMeasuringRef.current) return;

    const db = calculateDb(analyserRef.current);
    const now = Date.now();

    setCurrentDb(db);
    latestDbRef.current = db;

    if (now - lastChartUpdateRef.current >= CHART_UPDATE_INTERVAL_MS) {
      storeSetCurrentDb(db);
      lastChartUpdateRef.current = now;
    }

    if (isCalibratingRef.current) {
      // 캘리브레이션: 실제 환경 평균을 배경 소음으로 학습 (스파이크 감지 안 함)
      if (isFinite(db) && db > -100) {
        calibrationSumRef.current += db;
        calibrationCountRef.current += 1;
      }

      if (now - (calibrationStartRef.current ?? now) >= CALIBRATION_MS) {
        const avg =
          calibrationCountRef.current > 0
            ? calibrationSumRef.current / calibrationCountRef.current
            : INITIAL_BG;
        backgroundDbRef.current = avg;
        setBackgroundDb(avg);
        storeSetBackgroundDb(avg);
        isCalibratingRef.current = false;
      }
    } else {
      updateBackgroundDb(db);
      checkForSpike(db, now);
    }

    animationFrameRef.current = requestAnimationFrame(monitoringLoop);
  }, [
    calculateDb,
    updateBackgroundDb,
    checkForSpike,
    storeSetCurrentDb,
    storeSetBackgroundDb,
  ]);

  const startAudioMonitoring = useCallback(async () => {
    if (streamRef.current || isMeasuring) return;

    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 44100,
        },
      });

      audioContextRef.current = new (
        window.AudioContext || (window as any).webkitAudioContext
      )();

      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      const source = audioContextRef.current.createMediaStreamSource(
        streamRef.current
      );

      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 8192;
      analyserRef.current.smoothingTimeConstant = 0.5;

      source.connect(analyserRef.current);
      dataArrayRef.current = new Float32Array(analyserRef.current.fftSize);

      isMeasuringRef.current = true;
      lastChartUpdateRef.current = 0;
      lastBgDisplayRef.current = 0;

      // 배경 소음 캘리브레이션 초기화
      backgroundDbRef.current = INITIAL_BG;
      isCalibratingRef.current = true;
      calibrationStartRef.current = Date.now();
      calibrationSumRef.current = 0;
      calibrationCountRef.current = 0;

      if (modeRef.current === 'sleep') {
        const newId = startNewSession('SLEEP');
        sessionIdRef.current = newId;
        saveSession({
          id: newId,
          type: 'SLEEP',
          started_at: new Date().toISOString(),
        }).catch((err) => console.warn('세션 저장 실패:', err));
      }

      setBackgroundDb(INITIAL_BG);
      storeSetBackgroundDb(INITIAL_BG);
      setIsMeasuring(true);
      storeSetIsMeasuring(true);

      monitoringLoop();
    } catch (err: any) {
      alert('마이크 오류: ' + err.message);
    }
  }, [
    isMeasuring,
    monitoringLoop,
    storeSetIsMeasuring,
    startNewSession,
    storeSetBackgroundDb,
  ]);

  const stopAudioMonitoring = useCallback(() => {
    isMeasuringRef.current = false;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    audioContextRef.current?.close?.();
    audioContextRef.current = null;

    analyserRef.current = null;
    dataArrayRef.current = null;

    isCalibratingRef.current = false;

    setIsMeasuring(false);
    setIsSpiking(false);
    setCurrentDb(-Infinity);
    storeSetIsMeasuring(false);
    storeSetIsSpiking(false);

    if (modeRef.current === 'sleep') {
      const { sessionId: currentSessionId, sessionStartTime } =
        useNoiseStore.getState();

      if (currentSessionId) {
        const endedAt = new Date().toISOString();

        saveSession({
          id: currentSessionId,
          type: 'SLEEP',
          started_at: sessionStartTime ?? endedAt,
          ended_at: endedAt,
        }).catch((err) => console.warn('세션 종료 저장 실패:', err));
      }

      endCurrentSession();
    }
  }, [storeSetIsMeasuring, storeSetIsSpiking, endCurrentSession]);

  useEffect(() => {
    cleanupExpiredSpikes();
  }, []);

  useEffect(() => {
    return () => stopAudioMonitoring();
  }, [stopAudioMonitoring]);

  return {
    currentDb,
    backgroundDb,
    isMeasuring,
    isSpiking,
    startAudioMonitoring,
    stopAudioMonitoring,
    startAudio: startAudioMonitoring,
    stopAudio: stopAudioMonitoring,
  };
};
