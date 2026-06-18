import type { AqiGrade, OutdoorData } from '../types/domain';

import api from './api';

const gradeMap: Record<string, AqiGrade> = {
  good: 'good',
  moderate: 'moderate',
  bad: 'bad',
  very_bad: 'very_bad',
  좋음: 'good',
  보통: 'moderate',
  나쁨: 'bad',
  '매우 나쁨': 'very_bad',
};

const normalizeOutdoorData = (raw: Record<string, unknown>): OutdoorData => {
  const gradeSource = String(raw.aqi_grade ?? raw.aqi ?? 'good');
  const aqiGrade = gradeMap[gradeSource] ?? 'good';

  return {
    location: String(raw.location ?? '알 수 없음'),
    temperature: Number(raw.temperature ?? 0),
    humidity: Number(raw.humidity ?? 0),
    rainfall: Number(raw.rainfall ?? raw.precipitation ?? 0),
    aqi: typeof raw.aqi === 'number' ? raw.aqi : 0,
    aqi_grade: aqiGrade,
    pm25: Number(raw.pm25 ?? 0),
    pm10: Number(raw.pm10 ?? 0),
    uv_index: Number(raw.uv_index ?? raw.uv ?? 0),
    weather_description: String(
      raw.weather_description ?? raw.weather ?? '정보 없음'
    ),
    cached: Boolean(raw.cached ?? false),
    is_mock: Boolean(raw.is_mock ?? false),
    last_updated: String(raw.last_updated ?? new Date().toISOString()),
  };
};

export const getOutdoorData = async (location: string): Promise<OutdoorData> => {
  const response = await api.get('/outdoor', {
    params: { location },
  });

  return normalizeOutdoorData(response.data);
};

export interface OutdoorHistoryPoint {
  time: string;       // HH:mm 표시용
  temperature: number;
  humidity: number;
  pm25: number;
  aqi: number;
}

export const getOutdoorHistory = async (
  location: string,
  hours = 12,
): Promise<OutdoorHistoryPoint[]> => {
  try {
    const response = await api.get('/outdoor/history', {
      params: { location, hours },
    });
    const records: Array<Record<string, unknown>> = response.data?.records ?? [];
    return records.map((r) => ({
      time: new Date(String(r.last_updated)).toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      temperature: Number(r.temperature ?? 0),
      humidity: Number(r.humidity ?? 0),
      pm25: Number(r.pm25 ?? 0),
      aqi: Number(r.aqi ?? 0),
    }));
  } catch {
    return [];
  }
};