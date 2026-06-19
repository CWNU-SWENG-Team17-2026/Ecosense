import { useState, useEffect } from 'react';

import InfoCard from '../components/common/InfoCard';
import OutdoorChart from '../components/charts/OutdoorChart';
import { getOutdoorData } from '../services/outdoor';
import { searchLocations } from '../services/location';
import { useOutdoorStore } from '../stores/useOutdoorStore';
import { getAqiComment } from '../utils/aqi';
import {
  getFeelsLikeComment,
  getHumidityComment,
  getPm25Comment,
  getRainComment,
  getTemperatureComment,
  getUvComment,
} from '../utils/comment';

const gradeLabels = {
  good: { color: 'text-emerald-400', label: '좋음', comment: '야외 활동하기 좋은 날씨예요!' },
  moderate: { color: 'text-yellow-400', label: '보통', comment: '민감군은 주의가 필요해요' },
  bad: { color: 'text-orange-400', label: '나쁨', comment: '장시간 야외 활동을 자제하세요' },
  very_bad: { color: 'text-red-400', label: '매우 나쁨', comment: '외출을 자제하고 마스크를 착용하세요' },
};

const gradeToKorean = {
  good: '좋음',
  moderate: '보통',
  bad: '나쁨',
  very_bad: '매우 나쁨',
};

const weatherSourceLabels = {
  ultra_ncst: '기상청 초단기실황 (10분 갱신)',
  asos_hourly: '기상청 ASOS 시간관측 (매시 정시)',
  vilage_fcst: '기상청 단기예보',
};

export default function OutdoorPage() {
  const {
    data,
    location,
    isLoading,
    isCached,
    error,
    setLocation,
    setOutdoorData,
    setLoading,
    setError,
  } = useOutdoorStore();
  const [inputLocation, setInputLocation] = useState(location);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isGpsLoading, setIsGpsLoading] = useState(false);

  const loadOutdoorData = async (locationName, { forceRefresh = false } = {}) => {
    setLoading(true);
    setError(null);
    try {
      const outdoorData = await getOutdoorData(locationName, { forceRefresh });
      // 서버가 GPS 좌표를 가장 가까운 지역명으로 정규화해서 돌려주므로
      // inputLocation과 store location 모두 서버 응답값으로 갱신한다
      setLocation(outdoorData.location);
      setInputLocation(outdoorData.location);
      setOutdoorData(outdoorData);
    } catch (err) {
      console.error('실외 데이터 조회 실패:', err);
      setError('실외 데이터를 불러오지 못했습니다.');
      alert('실외 데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 페이지 진입 시 데이터가 없으면 자동 로드
  useEffect(() => {
    if (!data && !isLoading) {
      loadOutdoorData(location);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = async () => {
    await loadOutdoorData(inputLocation, { forceRefresh: true });
  };

  const handleSearchLocation = async () => {
    if (!inputLocation.trim()) {
      alert('검색할 지역을 입력하세요.');
      return;
    }

    try {
      setIsSearching(true);
      const results = await searchLocations(inputLocation);
      setSearchResults(Array.isArray(results) ? results : []);
    } catch (err) {
      console.error('지역 검색 실패:', err);
      alert('지역 검색에 실패했습니다.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectLocation = async (selectedLocation) => {
    const query =
      selectedLocation.lat != null && selectedLocation.lon != null
        ? `${selectedLocation.lat},${selectedLocation.lon}`
        : selectedLocation.name;
    setInputLocation(selectedLocation.name);
    setSearchResults([]);
    await loadOutdoorData(query);
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('이 브라우저에서는 위치 정보를 지원하지 않습니다.');
      return;
    }

    setIsGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const locationText = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
        setInputLocation(locationText);
        try {
          await loadOutdoorData(locationText);
        } finally {
          setIsGpsLoading(false);
        }
      },
      (geoError) => {
        console.error('위치 정보 조회 실패:', geoError);
        alert('위치 정보를 가져오지 못했습니다.');
        setIsGpsLoading(false);
      }
    );
  };

  const aqiInfo = data ? gradeLabels[data.aqi_grade] ?? gradeLabels.good : null;
  const feelsLike = data
    ? Number((data.temperature + (data.humidity - 50) * 0.05).toFixed(1))
    : null;
  const aqiLabel = data
    ? gradeToKorean[data.aqi_grade] ?? data.aqi_grade
    : null;
  const weatherSourceLabel = data?.weather_source
    ? weatherSourceLabels[data.weather_source] ?? data.weather_source
    : null;
  const weatherObservedLabel = data?.weather_observed_at
    ? new Date(data.weather_observed_at).toLocaleString('ko-KR', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <section className="outdoor-page p-6 max-w-2xl mx-auto text-white">
      <div className="mb-8">
        {data?.is_mock && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl px-4 py-3 mb-4 text-sm text-amber-300">
            ⚠️ 기상청/에어코리아 API 연동 전이라 <b>모의(Mock) 데이터</b>가 표시됩니다.
            API 키 활성화 후 새로고침하면 실제 데이터로 바뀝니다.
          </div>
        )}
        {!data?.is_mock && data?.weather_description === '정보 없음' && (
          <div className="bg-zinc-800/60 border border-zinc-700 rounded-2xl px-4 py-3 mb-4 text-sm text-zinc-400">
            ℹ️ 기상 정보를 불러오지 못했습니다. 대기질 데이터만 표시 중일 수 있습니다.
          </div>
        )}
        {!data?.is_mock && data?.weather_description && data.weather_description !== '정보 없음' && (
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl px-4 py-3 mb-4 text-sm text-emerald-300/80">
            {weatherSourceLabel ? (
              <span>기상: {weatherSourceLabel}</span>
            ) : (
              <span>기상: 기상청 관측 데이터</span>
            )}
            {data.weather_station ? ` · ${data.weather_station}` : ''}
            {weatherObservedLabel ? ` · 관측 ${weatherObservedLabel}` : ''}
            <span className="block mt-1 text-emerald-300/60">
              대기질: 에어코리아 실시간 측정
              {data?.cached ? ' · 캐시된 데이터 (새로고침으로 최신 조회)' : ''}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-3xl font-bold">실외 환경</h1>
            <p className="text-zinc-400 text-sm mt-1">
              기상청 + 대기질 정보
              {data?.cached ? ' (캐시된 데이터)' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isLoading}
            className="px-5 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-2xl text-sm disabled:opacity-50"
          >
            {isLoading ? '불러오는 중...' : '새로고침'}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={inputLocation}
            onChange={(event) => setInputLocation(event.target.value)}
            placeholder="지역을 입력하세요 (예: 경남 창원시)"
            className="flex-1 min-w-[200px] bg-zinc-900 border border-zinc-700 rounded-2xl px-4 py-2 text-sm focus:outline-none focus:border-emerald-500"
          />
          <button
            type="button"
            onClick={handleSearchLocation}
            disabled={isSearching}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-2xl text-sm disabled:opacity-50"
          >
            {isSearching ? '검색 중...' : '지역 검색'}
          </button>
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={isGpsLoading || isLoading}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-2xl text-sm disabled:opacity-50"
          >
            {isGpsLoading ? 'GPS...' : 'GPS'}
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isLoading}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-2xl text-sm disabled:opacity-50"
          >
            적용
          </button>
        </div>

        {searchResults.length > 0 && (
          <ul className="mt-3 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden text-sm">
            {searchResults.map((item, index) => (
              <li key={`${item.name}-${index}`} className="border-b border-zinc-800 last:border-b-0">
                <button
                  type="button"
                  onClick={() => handleSelectLocation(item)}
                  className="w-full text-left px-4 py-3 hover:bg-zinc-800 transition-colors"
                >
                  {item.name}
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
      </div>

      {!data ? (
        <div className="ecosense-card text-center py-16">
          <p className="text-zinc-400 mb-4">아직 불러온 데이터가 없어요</p>
          <button type="button" onClick={handleRefresh} className="btn-primary">
            실외 데이터 불러오기
          </button>
        </div>
      ) : (
        <>
          <div className="ecosense-card mb-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-zinc-400">{data.location}</p>
                <p className="text-5xl font-bold mt-1">{data.weather_description}</p>
              </div>
              <div className="text-right">
                <p className="text-6xl font-mono font-bold">{data.temperature}°</p>
                <p className="text-zinc-400">습도 {data.humidity}%</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            <InfoCard
              title="기온"
              value={`${data.temperature}℃`}
              description={getTemperatureComment(data.temperature)}
            />
            <InfoCard
              title="체감온도"
              value={`${feelsLike}℃`}
              description={getFeelsLikeComment(feelsLike)}
            />
            <InfoCard
              title="습도"
              value={`${data.humidity}%`}
              description={getHumidityComment(data.humidity)}
            />
            <InfoCard
              title="PM2.5"
              value={`${data.pm25}㎍/㎥`}
              description={getPm25Comment(data.pm25)}
            />
            <InfoCard
              title="AQI"
              value={aqiLabel}
              description={getAqiComment(aqiLabel)}
            />
            <InfoCard
              title="UV"
              value={String(data.uv_index ?? 0)}
              description={getUvComment(Number(data.uv_index ?? 0))}
            />
            <InfoCard
              title="강수량"
              value={`${data.rainfall ?? 0}mm`}
              description={getRainComment(data.rainfall ?? 0)}
            />
            <div className="bg-zinc-950 rounded-2xl p-4 border border-zinc-800 text-left">
              <p className="text-sm text-zinc-400 mb-1">종합 등급</p>
              <p className={`text-3xl font-bold ${aqiInfo?.color}`}>
                {aqiInfo?.label}
              </p>
              <p className="text-xs text-zinc-500 mt-2">{aqiInfo?.comment}</p>
            </div>
          </div>

          <div className="ecosense-card">
            <h2 className="text-lg font-semibold mb-4">실외 환경 그래프</h2>
            <OutdoorChart />
          </div>
        </>
      )}
    </section>
  );
}