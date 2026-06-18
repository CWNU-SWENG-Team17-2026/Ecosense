/**
 * useBluetooth.ts
 * LYWSD03MMC (Xiaomi Mijia) BLE 센서 연동 훅
 * 
 * Phase 2.1 리팩토링 포인트:
 * 1. battery 계산을 BLE 문서 기준으로 정확히 통일 (2200mV = 0%, 3000mV 근사 100%)
 * 2. disconnect 로직 완전 안전하게 정리 (removeEventListener + stopNotifications + gatt.disconnect)
 * 3. error 메시지 세분화 (NotFound, NotAllowed, Network, InvalidState 등)
 * 4. TDZ 방지 + 메모리 누수 방지 최우선
 * 5. useSensorStore와 완벽 연동
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useSensorStore } from '../stores/useSensorStore';

/** LYWSD03MMC 기본 펌웨어 전용 UUID */
const SERVICE_UUID = 'ebe0ccb0-7a0a-4b0c-8a1a-6ff2997da3a6';
const DATA_CHAR_UUID = 'ebe0ccc1-7a0a-4b0c-8a1a-6ff2997da3a6';

export const useBluetooth = () => {
  // Refs (TDZ 방지 + cleanup 안전)
  const deviceRef = useRef<BluetoothDevice | null>(null);
  const gattServerRef = useRef<BluetoothRemoteGATTServer | null>(null);
  const characteristicRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  const dataHandlerRef = useRef<((event: Event) => void) | null>(null);
  const disconnectHandlerRef = useRef<(() => void) | null>(null);

  // Local UI state
  const [isConnecting, setIsConnecting] = useState(false);

  // Store actions
  const { 
    setIndoorData, 
    setConnected, 
    setConnecting, 
    setError,
    reset: resetSensor 
  } = useSensorStore();

  /**
   * BLE 데이터 파싱 (LYWSD03MMC 기본 펌웨어 기준)
   * 
   * 패킷 구조 (6바이트):
   * [0][1] 온도 (Int16 little-endian, /100)
   * [2]    습도 (Uint8)
   * [3][4] 배터리 전압 mV (Uint16 little-endian)
   * [5]    (예비)
   */
  const parseSensorData = useCallback((value: DataView): { temperature: number; humidity: number; battery: number } | null => {
    try {
      // 온도: signed int16 little-endian → °C
      const tempRaw = value.getInt16(0, true);
      const temperature = Number((tempRaw / 100).toFixed(1));

      // 습도: 0~100%
      const humidity = value.getUint8(2);

      // 배터리 전압 (mV)
      const battMv = value.getUint16(3, true);

      // 배터리 퍼센트 계산 (BLE 문서 기준)
      // 2200mV ≈ 0%, 3000mV ≈ 100%
      let battery = 0;
      if (battMv > 2200) {
        battery = Math.round(((battMv - 2200) / 800) * 100);
      }
      battery = Math.max(0, Math.min(100, battery));

      return { temperature, humidity, battery };
    } catch (err) {
      console.error('❌ BLE 데이터 파싱 실패:', err);
      return null;
    }
  }, []);

  /** 데이터 수신 핸들러 */
  const handleCharacteristicValueChanged = useCallback((event: Event) => {
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
    if (!characteristic?.value) return;

    const data = parseSensorData(new DataView(characteristic.value.buffer));
    if (data) {
      setIndoorData(data);
    }
  }, [parseSensorData, setIndoorData]);

  /** GATT 연결 끊김 핸들러 */
  const handleGattDisconnected = useCallback(() => {
    console.warn('📴 GATT 서버 연결이 끊어졌습니다.');
    disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * 완전한 연결 해제 (메모리 누수 방지 최우선)
   */
  const disconnect = useCallback(async () => {
    try {
      // 1. Notification 중지
      if (characteristicRef.current) {
        await characteristicRef.current.stopNotifications().catch(() => {});
      }

      // 2. 이벤트 리스너 제거
      if (characteristicRef.current && dataHandlerRef.current) {
        characteristicRef.current.removeEventListener(
          'characteristicvaluechanged',
          dataHandlerRef.current
        );
      }

      if (deviceRef.current && disconnectHandlerRef.current) {
        deviceRef.current.removeEventListener(
          'gattserverdisconnected',
          disconnectHandlerRef.current
        );
      }

      // 3. GATT 연결 해제
      if (deviceRef.current?.gatt?.connected) {
        deviceRef.current.gatt.disconnect();
      }
    } catch (err) {
      console.warn('⚠️ disconnect 중 경미한 에러 (무시 가능):', err);
    } finally {
      // 4. Ref 초기화
      deviceRef.current = null;
      gattServerRef.current = null;
      characteristicRef.current = null;
      dataHandlerRef.current = null;
      disconnectHandlerRef.current = null;

      // 5. Store 초기화
      setConnected(false);
      resetSensor();
    }
  }, [setConnected, resetSensor]);

  /**
   * Bluetooth 연결 (Web Bluetooth API)
   */
  const connect = useCallback(async () => {
    if (isConnecting) return;

    setIsConnecting(true);
    setConnecting(true);
    setError(null);

    try {
      // 1. 기기 선택 (필터: 서비스 UUID)
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [SERVICE_UUID] }],
        optionalServices: [SERVICE_UUID],
      });

      deviceRef.current = device;

      // 2. 연결 끊김 이벤트 등록
      disconnectHandlerRef.current = handleGattDisconnected;
      device.addEventListener('gattserverdisconnected', disconnectHandlerRef.current);

      // 3. GATT 서버 연결
      const server = await device.gatt!.connect();
      gattServerRef.current = server;

      // 4. 서비스 + 캐릭터리스틱 획득
      const service = await server.getPrimaryService(SERVICE_UUID);
      const characteristic = await service.getCharacteristic(DATA_CHAR_UUID);
      characteristicRef.current = characteristic;

      // 5. Notification 시작
      dataHandlerRef.current = handleCharacteristicValueChanged;
      await characteristic.startNotifications();
      characteristic.addEventListener('characteristicvaluechanged', dataHandlerRef.current);

      // 6. 성공 처리
      setConnected(true);
      console.log('✅ LYWSD03MMC 연결 성공!');
    } catch (err: any) {
      let msg = 'Bluetooth 연결에 실패했습니다.';

      if (err.name === 'NotFoundError') {
        msg = '센서를 찾을 수 없습니다. 센서 전원이 켜져 있는지 확인해주세요.';
      } else if (err.name === 'NotAllowedError') {
        msg = 'Bluetooth 권한이 필요합니다. 브라우저 설정을 확인해주세요.';
      } else if (err.name === 'NetworkError') {
        msg = '연결이 불안정합니다. 센서를 가까이 가져다 다시 시도해주세요.';
      } else if (err.name === 'InvalidStateError') {
        msg = 'Bluetooth가 꺼져 있습니다. 기기의 Bluetooth를 켜주세요.';
      } else if (err.name === 'SecurityError') {
        msg = '보안 문제로 연결할 수 없습니다. HTTPS 환경에서만 동작합니다.';
      }

      setError(msg);
      console.error('❌ BLE 연결 실패:', err);

      // 실패 시 강제 정리
      await disconnect();
    } finally {
      setIsConnecting(false);
      setConnecting(false);
    }
  }, [
    isConnecting,
    setConnecting,
    setError,
    setConnected,
    handleCharacteristicValueChanged,
    handleGattDisconnected,
    disconnect,
  ]);

  /** 컴포넌트 언마운트 시 자동 정리 */
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    connect,
    disconnect,
    isConnecting,
    isSupported: typeof navigator !== 'undefined' && 'bluetooth' in navigator,
  };
};
