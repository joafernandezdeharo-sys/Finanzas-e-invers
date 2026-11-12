import { useEffect, useState } from 'react';
import { loadDevice, onDeviceChange, type DeviceSettings } from './device';

export function useDevice(): DeviceSettings {
  const [d, setD] = useState(loadDevice);
  useEffect(() => onDeviceChange(setD), []);
  return d;
}
