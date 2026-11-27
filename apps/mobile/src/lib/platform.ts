import { Platform } from 'react-native';

export function isIos(): boolean {
  return Platform.OS === 'ios';
}
