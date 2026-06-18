export const getNoiseComment = (db) => {
  if (db <= 50) return '조용한 환경입니다.';
  if (db <= 70) return '일반적인 생활 소음 수준입니다.';
  if (db <= 85) return '소음이 다소 높은 편입니다.';
  return '청력에 영향을 줄 수 있는 위험한 소음 수준입니다.';
};

export const getHumidityComment = (humidity) => {
  if (humidity <= 40)
    return '건조한 환경입니다. 충분한 수분 섭취와 보습을 권장합니다.';
  if (humidity <= 60) return '쾌적한 습도입니다.';
  if (humidity <= 80)
    return '습도가 다소 높은 편입니다. 환기를 권장합니다.';
  return '매우 습한 환경입니다. 곰팡이 발생에 주의하세요.';
};

export const getTemperatureComment = (temp) => {
  if (temp <= -10)
    return '매우 추운 날씨입니다. 외출 시 방한에 유의하세요.';
  if (temp <= 5)
    return '추운 날씨입니다. 따뜻한 옷차림을 권장합니다.';
  if (temp <= 20)
    return '활동하기 좋은 기온입니다.';
  if (temp <= 30)
    return '쾌적하고 따뜻한 날씨입니다.';
  return '폭염 수준의 더위입니다. 충분한 수분 섭취가 필요합니다.';
};

export const getRainComment = (rain) => {
  if (rain <= 3)
    return '비가 거의 없거나 약한 비가 내리고 있습니다.';
  if (rain <= 15)
    return '우산 준비를 권장합니다.';
  if (rain <= 30)
    return '강한 비가 내리고 있습니다. 외출 시 주의하세요.';
  return '호우 수준의 강수량입니다. 침수 및 안전사고에 주의하세요.';
};

export const getPm25Comment = (pm25) => {
  if (pm25 <= 15)
    return '공기질이 매우 좋습니다.';
  if (pm25 <= 35)
    return '공기질이 보통 수준입니다.';
  if (pm25 <= 75)
    return '공기질이 나쁩니다. 민감군은 주의하세요.';
  return '공기질이 매우 나쁩니다. 마스크 착용을 권장합니다.';
};

export const getPm10Comment = (pm10) => {
  if (pm10 <= 30)
    return '공기질이 매우 좋습니다.';
  if (pm10 <= 80)
    return '공기질이 보통 수준입니다.';
  if (pm10 <= 150)
    return '공기질이 나쁩니다.';
  return '공기질이 매우 나쁩니다. 외출을 자제하세요.';
};

export const getUvComment = (uv) => {
  if (uv <= 2)
    return '자외선이 약합니다.';
  if (uv <= 5)
    return '자외선이 보통 수준입니다.';
  if (uv <= 7)
    return '자외선이 강합니다. 자외선 차단제를 권장합니다.';
  return '자외선이 매우 강합니다. 장시간 야외 활동을 피하세요.';
};

export const getFeelsLikeComment = (temp) => {
  if (temp <= 0)
    return '매우 추운 체감온도입니다.';
  if (temp <= 15)
    return '다소 쌀쌀하게 느껴질 수 있습니다.';
  if (temp <= 25)
    return '쾌적한 체감온도입니다.';
  if (temp <= 33)
    return '더운 체감온도입니다.';
  return '매우 더운 체감온도입니다. 온열질환에 주의하세요.';
};