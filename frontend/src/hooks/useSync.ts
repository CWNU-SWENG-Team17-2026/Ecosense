import { useCallback, useEffect } from 'react';

import api from '../services/api';
import {
  getSpikes,
  getSpikesBySession,
  saveSpikeMetadata,
  saveSession,
} from '../services/indexedDB';
import { useAuthStore } from '../stores/useAuthStore';
import { useNoiseStore } from '../stores/useNoiseStore';

const buildUploadPayload = (
  spikes: Array<{
    session_id: string;
    detected_at: string;
    db_level: number;
    duration_sec: number;
  }>
) => {
  const sessions = new Map<
    string,
    { id: string; type: 'SLEEP'; started_at: string; ended_at: string }
  >();

  for (const spike of spikes) {
    const existing = sessions.get(spike.session_id);
    if (!existing) {
      sessions.set(spike.session_id, {
        id: spike.session_id,
        type: 'SLEEP',
        started_at: spike.detected_at,
        ended_at: spike.detected_at,
      });
      continue;
    }

    if (spike.detected_at < existing.started_at) {
      existing.started_at = spike.detected_at;
    }
    if (spike.detected_at > existing.ended_at) {
      existing.ended_at = spike.detected_at;
    }
  }

  return {
    sessions: Array.from(sessions.values()),
    spikes: spikes.map((spike) => ({
      session_id: spike.session_id,
      detected_at: spike.detected_at,
      db_level: spike.db_level,
      duration_sec: spike.duration_sec,
    })),
  };
};

export const useSync = () => {
  const { isAuthenticated } = useAuthStore();
  const { sessionId, sessionStartTime } = useNoiseStore();

  const uploadToServer = useCallback(async () => {
    if (!isAuthenticated || !sessionId) return false;

    try {
      const sessionSpikes = await getSpikesBySession(sessionId);

      const payload = {
        sessions: [
          {
            id: sessionId,
            type: 'SLEEP' as const,
            started_at: sessionStartTime || new Date().toISOString(),
            ended_at: new Date().toISOString(),
          },
        ],
        spikes: sessionSpikes.map((s) => ({
          session_id: s.session_id,
          detected_at: s.detected_at,
          db_level: s.db_level,
          duration_sec: s.duration_sec,
        })),
      };

      const response = await api.post('/sync/upload', payload);
      console.info('서버 업로드 완료:', response.data);
      return true;
    } catch (err) {
      console.error('서버 업로드 실패:', err);
      return false;
    }
  }, [isAuthenticated, sessionId, sessionStartTime]);

  const uploadAllLocalData = useCallback(async () => {
    if (!isAuthenticated) return false;

    try {
      const localSpikes = await getSpikes();
      if (localSpikes.length === 0) {
        return true;
      }

      const payload = buildUploadPayload(localSpikes);
      const response = await api.post('/sync/upload', payload);
      console.info('전체 로컬 데이터 업로드 완료:', response.data);
      return true;
    } catch (err) {
      console.error('전체 로컬 데이터 업로드 실패:', err);
      return false;
    }
  }, [isAuthenticated]);

  const downloadFromServer = useCallback(async () => {
    if (!isAuthenticated) return false;

    try {
      const response = await api.get('/sync/download?days=30');
      const sessions: Array<{
        id: string;
        type: 'OUTDOOR' | 'INDOOR' | 'SLEEP';
        started_at: string;
        ended_at?: string;
      }> = response.data?.sessions ?? [];
      const spikes: Array<{
        id: string;
        session_id: string;
        detected_at: string;
        db_level: number;
        duration_sec: number;
      }> = response.data?.spikes ?? [];

      // spike 수를 session별로 집계해서 같이 저장
      const spikeCountMap = new Map<string, number>();
      for (const spike of spikes) {
        spikeCountMap.set(spike.session_id, (spikeCountMap.get(spike.session_id) ?? 0) + 1);
      }

      for (const session of sessions) {
        await saveSession({
          id: session.id,
          type: session.type,
          started_at: session.started_at,
          ended_at: session.ended_at,
          spike_count: spikeCountMap.get(session.id) ?? 0,
        });
      }

      for (const spike of spikes) {
        await saveSpikeMetadata({
          id: spike.id,
          session_id: spike.session_id,
          detected_at: spike.detected_at,
          db_level: spike.db_level,
          duration_sec: spike.duration_sec,
        });
      }

      console.info(`서버 다운로드 완료: sessions=${sessions.length}, spikes=${spikes.length}`);
      return true;
    } catch (err) {
      console.error('서버 다운로드 실패:', err);
      return false;
    }
  }, [isAuthenticated]);

  const syncAll = useCallback(async () => {
    const uploaded = await uploadAllLocalData();
    if (!uploaded) return false;
    return downloadFromServer();
  }, [uploadAllLocalData, downloadFromServer]);

  useEffect(() => {
    if (isAuthenticated) {
      downloadFromServer();
    }
  }, [isAuthenticated, downloadFromServer]);

  return {
    uploadToServer,
    uploadAllLocalData,
    downloadFromServer,
    syncAll,
  };
};