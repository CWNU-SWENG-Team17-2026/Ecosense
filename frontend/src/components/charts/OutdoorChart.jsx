import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import { useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';

import { getOutdoorHistory } from '../../services/outdoor';
import { useOutdoorStore } from '../../stores/useOutdoorStore';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
);

const CHART_OPTIONS = {
  responsive: true,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: {
      labels: { color: '#a1a1aa', font: { size: 11 } },
    },
    tooltip: {
      backgroundColor: '#18181b',
      titleColor: '#e4e4e7',
      bodyColor: '#a1a1aa',
      borderColor: '#3f3f46',
      borderWidth: 1,
    },
  },
  scales: {
    x: {
      ticks: { color: '#71717a', font: { size: 10 }, maxTicksLimit: 6 },
      grid: { color: '#27272a' },
    },
    y: {
      ticks: { color: '#71717a', font: { size: 10 } },
      grid: { color: '#27272a' },
    },
  },
};

export default function OutdoorChart() {
  const { data: currentData, location } = useOutdoorStore();
  const [history, setHistory] = useState([]);
  const [activeMetric, setActiveMetric] = useState('temp'); // 'temp' | 'humidity' | 'pm25'
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!location) return;

    const load = async () => {
      setIsLoading(true);
      try {
        const points = await getOutdoorHistory(location, 12);
        setHistory(points);
      } catch (err) {
        console.error('히스토리 로드 실패:', err);
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [location, currentData]); // currentData 갱신될 때마다 차트도 업데이트

  // 히스토리가 없으면 현재 데이터 단일 포인트로 표시
  const displayHistory =
    history.length > 0
      ? history
      : currentData
      ? [
          {
            time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
            temperature: currentData.temperature,
            humidity: currentData.humidity,
            pm25: currentData.pm25,
            aqi: currentData.aqi,
          },
        ]
      : [];

  const labels = displayHistory.map((p) => p.time);

  const datasets = {
    temp: [
      {
        label: '기온 (℃)',
        data: displayHistory.map((p) => p.temperature),
        borderColor: '#34d399',
        backgroundColor: 'rgba(52, 211, 153, 0.1)',
        tension: 0.3,
        fill: true,
        pointRadius: displayHistory.length === 1 ? 5 : 3,
      },
    ],
    humidity: [
      {
        label: '습도 (%)',
        data: displayHistory.map((p) => p.humidity),
        borderColor: '#60a5fa',
        backgroundColor: 'rgba(96, 165, 250, 0.1)',
        tension: 0.3,
        fill: true,
        pointRadius: displayHistory.length === 1 ? 5 : 3,
      },
    ],
    pm25: [
      {
        label: 'PM2.5 (㎍/㎥)',
        data: displayHistory.map((p) => p.pm25),
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        tension: 0.3,
        fill: true,
        pointRadius: displayHistory.length === 1 ? 5 : 3,
      },
      {
        label: 'AQI',
        data: displayHistory.map((p) => p.aqi),
        borderColor: '#f87171',
        backgroundColor: 'rgba(248, 113, 113, 0.05)',
        tension: 0.3,
        fill: false,
        pointRadius: displayHistory.length === 1 ? 5 : 3,
      },
    ],
  };

  const chartData = {
    labels,
    datasets: datasets[activeMetric] ?? datasets.temp,
  };

  const metrics = [
    { key: 'temp', label: '기온' },
    { key: 'humidity', label: '습도' },
    { key: 'pm25', label: 'PM2.5 / AQI' },
  ];

  if (!currentData && displayHistory.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-zinc-500 text-sm">
        데이터를 불러오면 그래프가 표시됩니다
      </div>
    );
  }

  return (
    <div>
      {/* 메트릭 선택 탭 */}
      <div className="flex gap-1 mb-4">
        {metrics.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveMetric(key)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
              activeMetric === key
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
        {isLoading && (
          <span className="ml-auto text-xs text-zinc-500 self-center">갱신 중...</span>
        )}
      </div>

      {history.length === 0 && currentData && (
        <p className="text-xs text-zinc-500 mb-2">
          * 시계열 데이터가 쌓이면 실시간 그래프로 표시됩니다 (최근 12시간)
        </p>
      )}

      <Line data={chartData} options={CHART_OPTIONS} />

      {history.length > 0 && (
        <p className="text-[10px] text-zinc-600 mt-2 text-right">
          최근 {history.length}개 측정값 기준
        </p>
      )}
    </div>
  );
}
