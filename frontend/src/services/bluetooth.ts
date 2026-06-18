export const connectBluetoothSensor = async () => {
  if (!navigator.bluetooth) {
    throw new Error('이 브라우저는 Web Bluetooth API를 지원하지 않습니다.');
  }

  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: [],
  });

  const server = await device.gatt?.connect();

  return {
    device,
    server,
  };
};