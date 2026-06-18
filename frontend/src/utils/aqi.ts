export const getAqiComment = (aqi: string) => {
  if (aqi === '좋음') return '공기가 깨끗해 야외 활동하기 좋습니다.';
  if (aqi === '보통') return '대기질은 무난하지만 민감군은 주의하세요.';
  if (aqi === '나쁨') return '마스크 착용을 권장합니다.';
  if (aqi === '매우 나쁨') return '외출을 줄이고 창문을 닫는 것이 좋습니다.';

  return '대기질 정보를 확인 중입니다.';
};