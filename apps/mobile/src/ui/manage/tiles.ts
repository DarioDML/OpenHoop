import type { IconName } from '../Icon';
import type { IconTileStyle } from '../ListGroup';
import type { ColorTokens } from '../theme';

export type TileTone = 'info' | 'positive' | 'warning' | 'negative' | 'purple' | 'pink' | 'neutral' | 'gold';

export function tile(colors: ColorTokens, icon: IconName, tone: TileTone = 'neutral'): IconTileStyle {
  switch (tone) {
    case 'info':
      return { icon, color: colors.info, background: colors.infoSoft };
    case 'positive':
      return { icon, color: colors.positive, background: colors.positiveSoft };
    case 'warning':
      return { icon, color: colors.warning, background: colors.warningSoft };
    case 'negative':
      return { icon, color: colors.negative, background: colors.negativeSoft };
    case 'purple':
      return { icon, color: colors.purple, background: colors.purpleSoft };
    case 'pink':
      return { icon, color: colors.pink, background: colors.pinkSoft };
    case 'gold':
      return { icon, color: colors.gold, background: colors.goldSoft };
    default:
      return { icon, color: colors.textMuted, background: colors.surfaceAlt };
  }
}
