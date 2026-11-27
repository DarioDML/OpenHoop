import type { Language } from '@/data/types';
import { translate } from '@/i18n';

import { formatNumber } from './format';
import type { AlertPayload } from './notificationPlan';

export interface AlertText {
  title: string;
  body: string;
}

export function alertText(language: Language, alert: AlertPayload): AlertText {
  if (alert.kind === 'syncFailed') {
    return { title: translate(language, 'notif.syncFailed.title'), body: translate(language, 'notif.syncFailed.body') };
  }
  if (alert.kind === 'goal') {
    return {
      title: translate(language, `notif.goal.${alert.goal}.title`),
      body: translate(language, `notif.goal.${alert.goal}.body`, { count: alert.count, target: alert.target }),
    };
  }
  if (alert.kind === 'dataAtRisk') {
    return { title: translate(language, 'notif.dataAtRisk.title'), body: translate(language, 'notif.dataAtRisk.body', { days: alert.days }) };
  }
  const parts: string[] = [];
  if (alert.readiness !== null) parts.push(translate(language, 'notif.digest.readiness', { value: Math.round(alert.readiness) }));
  if (alert.sleepScore !== null) parts.push(translate(language, 'notif.digest.sleep', { value: Math.round(alert.sleepScore) }));
  if (alert.load !== null) parts.push(translate(language, 'notif.digest.load', { value: formatNumber(alert.load, 1, language) }));
  return {
    title: translate(language, 'notif.digest.title'),
    body: parts.length > 0 ? parts.join(' · ') : translate(language, 'notif.digest.noData'),
  };
}
