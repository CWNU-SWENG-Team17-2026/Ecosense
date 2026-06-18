import { useBluetooth } from '../hooks/useBluetooth';
import { useOutdoorStore } from '../stores/useOutdoorStore';
import { useSensorStore } from '../stores/useSensorStore';

export default function IndoorPage() {
  const { connect, disconnect, isConnecting, isSupported } = useBluetooth();
  const {
    temperature,
    humidity,
    battery,
    connected,
    lastUpdated,
    isConnecting: storeIsConnecting,
    error,
  } = useSensorStore();
  const { data: outdoorData } = useOutdoorStore();

  const isLoading = isConnecting || storeIsConnecting;

  const getTempColor = (temp) => {
    if (temp >= 28) return 'text-orange-400';
    if (temp >= 24) return 'text-emerald-400';
    if (temp >= 18) return 'text-sky-400';
    return 'text-blue-400';
  };

  const getHumidityInfo = (hum) => {
    if (hum < 30) return { color: 'text-amber-400', comment: '건조해요. 가습기 추천!' };
    if (hum < 40) return { color: 'text-yellow-400', comment: '조금 건조해요. 보습을 권장합니다.' };
    if (hum <= 60) return { color: 'text-emerald-400', comment: '쾌적한 습도예요' };
    return { color: 'text-sky-400', comment: '습해요. 환기 추천!' };
  };

  const humidityInfo = getHumidityInfo(humidity);

  return (
    <section className="indoor-page p-6 max-w-2xl mx-auto text-white">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">실내 환경</h1>
          <p className="text-zinc-400 text-sm mt-1">LYWSD03MMC 센서 연동</p>
        </div>

        <div
          className={`px-4 py-1.5 rounded-full text-sm font-medium flex items-center gap-2 ${
            connected
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
              : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              connected ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'
            }`}
          />
          {connected ? '연결됨' : '미연결'}
        </div>
      </div>

      <div className="ecosense-card mb-6">
        <div className="flex justify-between items-start mb-8">
          <div>
            <p className="text-sm text-zinc-400 mb-1">현재 온도</p>
            <p
              className={`text-7xl font-mono font-bold tracking-tighter ${getTempColor(
                temperature
              )}`}
            >
              {connected ? temperature.toFixed(1) : '--'}
              <span className="text-3xl font-normal text-white/60 ml-1">°C</span>
            </p>
          </div>

          <div className="text-right">
            <p className="text-sm text-zinc-400 mb-1">현재 습도</p>
            <p
              className={`text-5xl font-mono font-bold tracking-tighter ${humidityInfo.color}`}
            >
              {connected ? humidity : '--'}
              <span className="text-2xl font-normal text-white/60 ml-1">%</span>
            </p>
            {connected && (
              <p className="text-xs text-zinc-500 mt-1">{humidityInfo.comment}</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between bg-zinc-950 rounded-2xl p-4 mb-6">
          <div className="flex items-center gap-3">
            <span className="text-zinc-400">센서 배터리</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-24 h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 transition-all duration-500"
                style={{ width: `${connected ? battery : 0}%` }}
              />
            </div>
            <span className="font-mono text-emerald-400 text-lg w-12 text-right">
              {connected ? `${battery}%` : '--'}
            </span>
          </div>
        </div>

        {lastUpdated && connected && (
          <p className="text-[10px] text-zinc-500 text-center font-mono">
            마지막 업데이트:{' '}
            {new Date(lastUpdated).toLocaleTimeString('ko-KR')}
          </p>
        )}
      </div>

      {outdoorData && (
        <div className="ecosense-card mb-6">
          <h2 className="text-lg font-semibold mb-3">실내 vs 실외 비교</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-zinc-950 rounded-xl p-4">
              <p className="text-zinc-400">실내 온도</p>
              <p className="text-2xl font-mono mt-1">
                {connected ? `${temperature.toFixed(1)}°C` : '--'}
              </p>
            </div>
            <div className="bg-zinc-950 rounded-xl p-4">
              <p className="text-zinc-400">실외 온도</p>
              <p className="text-2xl font-mono mt-1">
                {outdoorData.temperature}°C
              </p>
            </div>
            <div className="bg-zinc-950 rounded-xl p-4">
              <p className="text-zinc-400">실내 습도</p>
              <p className="text-2xl font-mono mt-1">
                {connected ? `${humidity}%` : '--'}
              </p>
            </div>
            <div className="bg-zinc-950 rounded-xl p-4">
              <p className="text-zinc-400">실외 습도</p>
              <p className="text-2xl font-mono mt-1">{outdoorData.humidity}%</p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {!connected ? (
          <button
            type="button"
            onClick={connect}
            disabled={isLoading || !isSupported}
            className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed text-lg py-5"
          >
            {isLoading ? '센서 연결 중...' : '센서 연결하기'}
          </button>
        ) : (
          <button
            type="button"
            onClick={disconnect}
            className="w-full bg-red-500 hover:bg-red-600 text-white py-5 rounded-2xl font-medium text-lg"
          >
            센서 연결 해제
          </button>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/40 text-red-400 p-4 rounded-2xl text-sm">
            {error}
          </div>
        )}

        {!isSupported && (
          <p className="text-center text-xs text-zinc-500">
            이 브라우저는 Web Bluetooth를 지원하지 않습니다. Chrome 또는 Edge를
            사용해주세요.
          </p>
        )}
      </div>
    </section>
  );
}