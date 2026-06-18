import { useState, useRef, useCallback, useEffect } from 'react';

import { saveSpikeWithBlob, cleanupExpiredSpikes, saveSession } from '../services/indexedDB';
import { useNoiseStore } from '../stores/useNoiseStore';

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
  const chunksRef = useRef<Blob[]>([]);
  const latestDbRef = useRef<number>(-Infinity);
  const isMeasuringRef = useRef(false);
  const modeRef = useRef(mode);
  const recorderOnDataRef = useRef<((e: BlobEvent) => void) | null>(null);
  const recorderOnStopRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const calculateDb = useCallback((analyser: AnalyserNode): number => {
    if (!dataArrayRef.current) return -Infinity;
    analyser.getFloatTimeDomainData(dataArrayRef.current as Float32Array<ArrayBuffer>);
    let sum = 0;
    for (let i = 0; i < dataArrayRef.current.length; i++) {
      const sample = dataArrayRef.current[i];
      sum += sample * sample;
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
    latestDbRef.current = currentDb;
    recorderOnDataRef.current = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorderOnStopRef.current = async () => {
      const durationSec =
        (Date.now() - (spikeStartTimeRef.current ?? 0)) / 1000;
      if (durationSec < 2 || chunksRef.current.length === 0) {
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
    recorder.ondataavailable = recorderOnDataRef.current;
    recorder.onstop = recorderOnStopRef.current;
    recorder.start(1000);
  }, [sessionId, currentDb, addSpike, cleanupRecorder]);

  const checkForSpike = useCallback(
    (current: number) => {
      if (modeRef.current !== 'sleep') return;
      const threshold = backgroundDb + 15;
      if (current > threshold) {
        if (!isSpiking) {
          setIsSpiking(true);
          storeSetIsSpiking(true);
          startSpikeRecording();
        }
      } else if (isSpiking && spikeStartTimeRef.current) {
        const durationSec =
          (Date.now() - spikeStartTimeRef.current) / 1000;
        if (durationSec >= 2 && mediaRecorderRef.current) {
          mediaRecorderRef.current.stop();
        } else {
          mediaRecorderRef.current?.stop();
          cleanupRecorder();
        }
        setIsSpiking(false);
        storeSetIsSpiking(false);
      }
    },
    [backgroundDb, isSpiking, startSpikeRecording, cleanupRecorder, storeSetIsSpiking]
  );

  const monitoringLoop = useCallback(() => {
    if (!analyserRef.current || !isMeasuringRef.current) return;
    const db = calculateDb(analyserRef.current);
    setCurrentDb(db);
    storeSetCurrentDb(db);
    latestDbRef.current = db;
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
      if (modeRef.current === 'sleep') {
        const newId = startNewSession('SLEEP');
        const startedAt = new Date().toISOString();
        // 게스트 모드를 포함해 항상 로컬 IndexedDB에 세션 저장
        saveSession({ id: newId, type: 'SLEEP', started_at: startedAt }).catch(
          (err) => console.warn('세션 IndexedDB 저장 실패:', err),
        );
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
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close?.();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    dataArrayRef.current = null;
    setIsMeasuring(false);
    setIsSpiking(false);
    setCurrentDb(-Infinity);
    storeSetIsMeasuring(false);
    storeSetIsSpiking(false);
    if (modeRef.current === 'sleep') {
      // endCurrentSession() 전에 현재 store 상태를 캡처해서 ended_at 업데이트
      const { sessionId: currentSessionId, sessionStartTime } =
        useNoiseStore.getState();
      if (currentSessionId) {
        const endedAt = new Date().toISOString();
        saveSession({
          id: currentSessionId,
          type: 'SLEEP',
          started_at: sessionStartTime ?? endedAt,
          ended_at: endedAt,
        }).catch((err) => console.warn('세션 종료 IndexedDB 저장 실패:', err));
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