const iconMap = {
  기온: '🌡️',
  체감온도: '🧥',
  습도: '💧',
  'PM2.5': '🌫️',
  PM10: '🌫️',
  AQI: '🍃',
  UV: '☀️',
  강수량: '🌧️',
  '실내 온도': '🏠',
  '실내 습도': '💧',
  '현재 소음': '🔊',
};

export default function InfoCard({ title, value, description }) {
  const icon = iconMap[title] ?? '📌';

  return (
    <div className="bg-zinc-950 rounded-2xl p-4 border border-zinc-800 text-left">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">{icon}</span>
            <h3 className="text-sm text-zinc-400 m-0">{title}</h3>
          </div>
          <strong className="block text-2xl font-mono text-white mb-1">
            {value}
          </strong>
          {description && (
            <p className="text-xs text-zinc-500 m-0 leading-relaxed">
              {description}
            </p>
          )}
        </div>
        <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-xl shrink-0">
          {icon}
        </div>
      </div>
    </div>
  );
}