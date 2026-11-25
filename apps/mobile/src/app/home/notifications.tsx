import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { formatAgo } from '@/lib/format';
import type { AlertKind, InboxEntry } from '@/lib/notificationPlan';
import { alertText } from '@/lib/notificationText';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Pill } from '@/ui/Chip';
import { Button } from '@/ui/controls';
import { Page } from '@/ui/daily/bits';
import { Icon, type IconName } from '@/ui/Icon';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { StateCard } from '@/ui/StateCard';
import { radius, spacing, useTheme } from '@/ui/theme';

const FILTERS = ['all', 'insights', 'device'] as const;
type Filter = (typeof FILTERS)[number];

const FILTER_OF: Record<AlertKind, Exclude<Filter, 'all'>> = {
  digest: 'insights',
  syncFailed: 'device',
  dataAtRisk: 'device',
};

const ICON_OF: Record<AlertKind, IconName> = {
  digest: 'sparkle',
  syncFailed: 'sync',
  dataAtRisk: 'alert',
};

function InboxRow({ entry, unread, nowS }: { entry: InboxEntry; unread: boolean; nowS: number }) {
  const { t, language } = useT();
  const { colors } = useTheme();
  const text = alertText(language, entry);
  const tint = entry.kind === 'digest' ? colors.purple : colors.warning;
  return (
    <View testID={`inbox-${entry.id}`} style={{ flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm }}>
      <View style={{ width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={ICON_OF[entry.kind]} color={tint} size={18} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <AppText variant="bodyStrong" style={{ flex: 1 }}>
            {text.title}
          </AppText>
          {unread ? (
            <View
              testID={`unread-${entry.id}`}
              accessible
              accessibilityLabel={t('home.notif.unread')}
              style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.link }}
            />
          ) : null}
          <AppText variant="caption" muted>
            {formatAgo(t, nowS, Math.floor(entry.at / 1000))}
          </AppText>
        </View>
        <AppText variant="label" muted>
          {text.body}
        </AppText>
      </View>
    </View>
  );
}

export default function NotificationsScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { inbox, userData, notificationPermission, markInboxRead, clearInbox, refreshNotifications } = useAppData();
  const [filter, setFilter] = useState<Filter>('all');
  const [unreadIds] = useState(() => new Set(inbox.filter((entry) => !entry.read).map((entry) => entry.id)));
  const prefs = userData.notifications;
  const enabled = prefs.enabled && notificationPermission === 'granted';
  const nowS = Math.floor(Date.now() / 1000);

  useEffect(() => {
    void refreshNotifications().then(markInboxRead);
  }, [refreshNotifications, markInboxRead]);

  const shown = filter === 'all' ? inbox : inbox.filter((entry) => FILTER_OF[entry.kind] === filter);

  return (
    <Page title={t('home.notifications')} testID="notifications">
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {FILTERS.map((option) => (
          <Pill key={option} label={t(`home.notif.${option}`)} selected={filter === option} onPress={() => setFilter(option)} testID={`filter-${option}`} />
        ))}
      </View>

      {!enabled ? (
        <StateCard
          testID="notifications-off"
          icon="bell"
          tone="neutral"
          title={t('home.notif.offTitle')}
          body={t('home.notif.offBody')}
          actionLabel={t('home.notif.turnOn')}
          onAction={() => router.push('/settings/app')}
        />
      ) : null}

      {shown.length === 0 ? (
        <Card tone="outline" style={{ gap: 6 }} testID="inbox-empty">
          <AppText variant="bodyStrong">{t('home.notif.emptyTitle')}</AppText>
          <AppText variant="label" muted>
            {t('home.notif.emptyBody')}
          </AppText>
        </Card>
      ) : (
        <Card style={{ gap: 0 }} testID="inbox-list">
          {shown.map((entry) => (
            <InboxRow key={entry.id} entry={entry} unread={unreadIds.has(entry.id)} nowS={nowS} />
          ))}
        </Card>
      )}

      <Card tone="outline" style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Icon name="moon" color={colors.textMuted} size={18} />
          <AppText variant="bodyStrong">{t('home.notif.quietTitle')}</AppText>
        </View>
        <AppText variant="label" muted>
          {t('home.notif.quietBody', { start: prefs.quietStart, end: prefs.quietEnd })}
        </AppText>
      </Card>

      {inbox.length > 0 ? <Button variant="secondary" label={t('home.notif.clear')} onPress={() => void clearInbox()} testID="inbox-clear" /> : null}

      <ListGroup>
        <ListRow title={t('home.notif.settings')} onPress={() => router.push('/settings/app')} />
      </ListGroup>
    </Page>
  );
}
