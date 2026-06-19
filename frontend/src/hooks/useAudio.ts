import { useState, useRef, useCallback, useEffect } from 'react';

import { saveSpikeWithBlob, cleanupExpiredSpikes, saveSession } from '../services/indexedDB';
import { useNoiseStore } from '../stores/useNoiseStore';

const CHART_UPDATE_INTERVAL_MS = 500;
const SPIKE_END_QUIET_MS = 1000;

export const useAudio = () => {
  const [currentDb, setCurrentDb] = useState(-Infinity);
  const [backgroundDb, setBackgroundDb] = useState(-65);
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
  const chunksRef = useRef<Blob[]>([]);
  const latestDbRef = useRef<number>(-Infinity);
  const lastChartUpdateRef = useRef(0);
  const isMeasuringRef = useRef(false);
  const modeRef = useRef(mode);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

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

  const updateBackgroundDb = useCallback(
    (current: number) => {
      if (!isFinite(current) || current < -100) return;

      if (current < backgroundDb + 10) {
        const newBg = backgroundDb * 0.95 + current * 0.05;
        setBackgroundDb(newBg);
        storeSetBackgroundDb(newBg);
      }
    },
    [backgroundDb, storeSetBackgroundDb]
  );

  const cleanupRecorder = useCallback(() => {
    mediaRecorderRef.current = null;
    spikeStartTimeRef.current = null;
    spikeQuietStartRef.current = null;
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
    latestDbRef.current = currentDb;

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
        session_id: sessionId ?? crypto.randomUUID(),
        detected_at: new Date().toISOString(),
        db_level: Math.round(latestDbRef.current),
        duration_sec: Math.round(durationSec),
      };

      await saveSpikeWithBlob(spike, blob);
      addSpike(spike);
      cleanupRecorder();
    };

    recorder.start(1000);
  }, [sessionId, currentDb, addSpike, cleanupRecorder]);

  const checkForSpike = useCallback(
    (current: number) => {
      if (modeRef.current !== 'sleep') return;

      const threshold = backgroundDb + 15;
      const now = Date.now();

      if (current > threshold) {
        spikeQuietStartRef.current = null;

        if (!mediaRecorderRef.current) {
          setIsSpiking(true);
          storeSetIsSpiking(true);
          startSpikeRecording();
        }

        latestDbRef.current = current;
        return;
      }

      if (mediaRecorderRef.current && spikeStartTimeRef.current) {
        if (spikeQuietStartRef.current === null) {
          spikeQuietStartRef.current = now;
        }

        const quietDurationMs = now - spikeQuietStartRef.current;

        if (quietDurationMs >= SPIKE_END_QUIET_MS) {
          mediaRecorderRef.current.stop();
          setIsSpiking(false);
          storeSetIsSpiking(false);
          spikeQuietStartRef.current = null;
        }
      }
    },
    [backgroundDb, startSpikeRecording, storeSetIsSpiking]
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

    updateBackgroundDb(db);
    checkForSpike(db);

    animationFrameRef.current = requestAnimationFrame(monitoringLoop);
  }, [calculateDb, updateBackgroundDb, checkForSpike, storeSetCurrentDb]);

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
      analyserRef.current.smoothingTimeConstant = 0.75;

      source.connect(analyserRef.current);
      dataArrayRef.current = new Float32Array(analyserRef.current.fftSize);

      isMeasuringRef.current = true;
      lastChartUpdateRef.current = 0;

      if (modeRef.current === 'sleep') {
        const newId = startNewSession('SLEEP');
        saveSession({
          id: newId,
          type: 'SLEEP',
          started_at: new Date().toISOString(),
        }).catch((err) => console.warn('세션 저장 실패:', err));
      }

      setBackgroundDb(-65);
      storeSetBackgroundDb(-65);
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

    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    audioContextRef.current?.close?.();
    audioContextRef.current = null;

    analyserRef.current = null;
    dataArrayRef.current = null;

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