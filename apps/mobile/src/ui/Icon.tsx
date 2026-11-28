import type { ColorValue } from 'react-native';
import Svg, { Path } from 'react-native-svg';

export const ICON_PATHS = {
  home: 'M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  health: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  plus: 'M12 5v14M5 12h14',
  community: 'M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6.5 6.5 0 0 1 3.5 6',
  more: 'M4 6h16M4 12h16M4 18h16',
  coach: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z',
  flame: 'M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-3.5 2-5 1 1.5 2 2 3 2-1-2-1-4 0-7z',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  sleep: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  back: 'M15 5l-7 7 7 7',
  chevronRight: 'M9 5l7 7-7 7',
  chevronDown: 'M5 9l7 7 7-7',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12l5 5L19 7',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 7.5v.5',
  alert: 'M12 11v6M12 7.5v.5M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  load: 'M13 2L4 14h7l-1 8 9-12h-7l1-8z',
  trends: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  band: 'M8 3h8l1 4v10l-1 4H8l-1-4V7zM7 9h10M7 15h10',
  bluetooth: 'M7 7l10 10-5 4V3l5 4L7 17',
  sync: 'M20 11a8 8 0 0 0-14.9-3M4 5v4h4M4 13a8 8 0 0 0 14.9 3M20 19v-4h-4',
  battery: 'M3 8h15a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM21 10.5v3',
  plug: 'M9 3v5M15 3v5M7 8h10v4a5 5 0 0 1-10 0zM12 17v4',
  calendar: 'M4 6.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM8 3v3M16 3v3M4 10h16',
  offline: 'M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 5-2.7M19 12.5a10 10 0 0 0-2.5-1.7M2 8.8a15 15 0 0 1 4.5-2.8M12 20h.01',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  pulse: 'M3 12h4l2-5 4 10 2-5h6',
  lungs: 'M12 4v8M12 12c-2 0-3 1-4 3s-3 5-5 4V12a4 4 0 0 1 4-4M12 12c2 0 3 1 4 3s3 5 5 4V12a4 4 0 0 0-4-4',
  drop: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  thermometer: 'M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z',
  steps: 'M8 4c1.5 0 2.5 1.5 2.5 4S9.5 12 8 12s-2-1.5-2-4 .5-4 2-4zM6.5 15h3l-.5 4H7zM16 8c1.5 0 2 1.5 2 4s-1 4-2.5 4-2.5-1.5-2.5-4S14.5 8 16 8zM14.5 19h3l-.5 3h-2z',
  journal: 'M6 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 7h6M8 11h6',
  dumbbell: 'M6 7v10M18 7v10M3 9.5v5M21 9.5v5M6 12h12',
  report: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  device: 'M8 3h8l1 4v10l-1 4H8l-1-4V7z',
  settings: 'M4 7h9M19 7h1M4 17h1M11 17h9M16 9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM8 19.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  code: 'M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14',
  gift: 'M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7c-1.5-3-5-3-5-1s3 1 5 1zM12 7c1.5-3 5-3 5-1s-3 1-5 1z',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17v.01',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  share: 'M12 15V3M8 7l4-4 4 4M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7',
  play: 'M7 4l13 8-13 8z',
  pause: 'M8 5v14M16 5v14',
  stop: 'M6 6h12v12H6z',
  mic: 'M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zM6 11a6 6 0 0 0 12 0M12 17v4',
  send: 'M4 12l16-8-6 16-2-7z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  alarm: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2 2M4 4l3-2M20 4l-3-2',
  plane: 'M3 13l7-2 4-8 2 1-2 7 6 2v2l-6-1-3 6-2-1 1-5-7 1z',
  map: 'M9 4l6 2 5-2v16l-5 2-6-2-5 2V6zM9 4v16M15 6v16',
  wind: 'M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h7',
  sparkle: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H4a3 3 0 0 0 4 4M16 6h4a3 3 0 0 1-4 4M12 13v4M8 21h8M9 17h6',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  import: 'M12 3v12M8 11l4 4 4-4M5 21h14',
  export: 'M12 15V3M8 7l4-4 4 4M5 21h14',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  widget: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  filter: 'M4 6h16M7 12h10M10 18h4',
  run: 'M14 4.5a1.5 1.5 0 1 0 0-.01M6 20l3-5 3 2 1-5 3 3h3M9 9l3-1 2 2',
  walk: 'M13 4.5a1.5 1.5 0 1 0 0-.01M10 21l2-6-2.5-2.5L11 8l3 3h3M9.5 12.5L7 14',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-1-3-2 .2-1.3-1.3L17 5l-3-1-1 2h-2L10 4 7 5l.3 2L6 8.3 4 8 3 11l2 1-2 1 1 3 2-.2 1.3 1.3L7 19l3 1 1-2h2l1 2 3-1-.3-2 1.3-1.3 2 .3 1-3z',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  coffee: 'M5 8h12v6a5 5 0 0 1-10 0zM17 10h2a2 2 0 0 1 0 4h-2M8 3v2M12 3v2',
  playCircle: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM10 8.5l5 3.5-5 3.5z',
  calendarPlus: 'M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8 3v4M16 3v4M12 10v6M9 13h6',
  flask: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3M7.5 15h9',
  clipboard: 'M7 4h10a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM9 4V3h6v1M9 11h6M9 15h4',
  file: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  chevronUp: 'M5 15l7-7 7 7',
  bike: 'M5.5 19.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM18.5 19.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5.5 16l4-6h6l3 6M9.5 10l3 6h-7M15.5 10l-1-3h-2',
  swim: 'M3 18c2 0 2-1.5 4.5-1.5S9.5 18 12 18s2.5-1.5 4.5-1.5S19 18 21 18M16 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM5 14l4.5-4 3 2.5 3 1.5',
  yoga: 'M12 6a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM5 9l7 1 7-1M12 10v5M12 15l-4 6M12 15l4 6',
  mountain: 'M3 20l6-11 4 6.5 2.5-3.5L21 20z',
  gps: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 1v4M12 19v4M1 12h4M19 12h4',
} as const;

export type IconName = keyof typeof ICON_PATHS;

interface Props {
  name: IconName;
  color: ColorValue;
  size?: number;
  strokeWidth?: number;
  fill?: ColorValue;
}

export function Icon({ name, color, size = 24, strokeWidth = 1.75, fill = 'none' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d={ICON_PATHS[name]} />
    </Svg>
  );
}

interface PathIconProps {
  d: string;
  color: ColorValue;
  size?: number;
  strokeWidth?: number;
}

export function PathIcon({ d, color, size = 24, strokeWidth = 1.75 }: PathIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d={d} />
    </Svg>
  );
}
