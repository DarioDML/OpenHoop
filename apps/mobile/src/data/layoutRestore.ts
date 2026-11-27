import { DEFAULT_DASHBOARD, HOME_SECTIONS, type UserData } from './userData';

function sameList<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

export function isCustomLayout(data: Pick<UserData, 'dashboardTiles' | 'homeSections'>): boolean {
  return !sameList(data.dashboardTiles, DEFAULT_DASHBOARD) || !sameList(data.homeSections, HOME_SECTIONS);
}

export function previousLayoutPatch(data: UserData): Partial<UserData> | null {
  const tiles = data.previousDashboardTiles;
  const sections = data.previousHomeSections;
  if (tiles === null && sections === null) return null;
  return {
    ...(tiles === null ? null : { dashboardTiles: tiles, previousDashboardTiles: data.dashboardTiles }),
    ...(sections === null ? null : { homeSections: sections, previousHomeSections: data.homeSections }),
  };
}
