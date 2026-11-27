import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAppData } from '@/data/context';
import type { Language } from '@/data/types';
import { useT } from '@/i18n/useT';
import { deviceTzOffsetS } from '@/lib/dates';
import { formatClock } from '@/lib/format';
import { localDay, type AlertKind, type InboxEntry } from '@/lib/notificationPlan';
import { alertText } from '@/lib/notificationText';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button, Segmented } from '@/ui/controls';
import { IconTile, Page } from '@/ui/daily/bits';
import { Icon } from '@/ui/Icon';
import type { IconTileStyle } from '@/ui/ListGroup';
import { tile } from '@/ui/manage/tiles';
import { StateCard } from '@/ui/StateCard';
import { spacing, useTheme, type ColorTokens } from '@/ui/theme';
import { IconButton } from '@/ui/TopBar';

const FILTERS = ['all', 'insights', 'device', 'goals'] as const;
type Filter = (typeof FILTERS)[number];

const FILTER_OF: Record<AlertKind, Exclude<Filter, 'all'>> = {
  digest: 'insights',
  syncFailed: 'device',
  dataAtRisk: 'device',
  goal: 'goals',
  windDown: 'insights',
};

function tileOf(colors: ColorTokens, kind: AlertKind): IconTileStyle {
  if (kind === 'digest') return tile(colors, 'sun', 'gold');
  if (kind === 'syncFailed') return tile(colors, 'sync', 'warning');
  if (kind === 'dataAtRisk') return tile(colors, 'alert', 'negative');
  if (kind === 'windDown') return tile(colors, 'moon', 'purple');
  return tile(colors, 'check', 'positive');
}

function stamp(at: number, today: boolean, language: Language): string {
  const date = new Date(at);
  if (today) return formatClock(Math.floor(at / 1000), deviceTzOffsetS(date));
  return date.toLocaleDateString(language === 'nl' ? 'nl-NL' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function targetOf(kind: AlertKind): Href {
  if (kind === 'digest') return '/home/morning-brief';
  if (kind === 'goal') return '/plan';
  return '/settings/device';
}

function InboxRow({ entry, today, first, onOpen }: { entry: InboxEntry; today: boolean; first: boolean; onOpen: (entry: InboxEntry) => void }) {
  const { t, language } = useT();
  const { colors } = useTheme();
  const text = alertText(language, entry);
  return (
    <Pressable
      testID={`inbox-${entry.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${text.title}. ${text.body}${entry.read ? '' : `. ${t('home.notif.unread')}`}`}
      onPress={() => onOpen(entry)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: spacing.lg,
        paddingVertical: spacing.lg,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.border,
        opacity: pressed ? 0.8 : 1,
      })}>
      <IconTile tile={tileOf(colors, entry.kind)} size={40} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
          <AppText variant="cardTitle" style={{ flex: 1 }}>
            {text.title}
          </AppText>
          <AppText variant="label" muted numeric style={{ paddingTop: 2 }}>
            {stamp(entry.at, today, language)}
          </AppText>
          <View style={{ width: 10, paddingTop: 7, alignItems: 'flex-end' }}>
            {entry.read ? null : (
              <View
                testID={`unread-${entry.id}`}
                accessible
                accessibilityLabel={t('home.notif.unread')}
                style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.link }}
              />
            )}
          </View>
        </View>
        <AppText variant="body" muted>
          {text.body}
        </AppText>
      </View>
    </Pressable>
  );
}

function Group({
  title,
  entries,
  today,
  action,
  onOpen,
  testID,
}: {
  title: string;
  entries: readonly InboxEntry[];
  today: boolean;
  action?: { label: string; onPress: () => void };
  onOpen: (entry: InboxEntry) => void;
  testID: string;
}) {
  if (entries.length === 0) return null;
  return (
    <View testID={testID}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
        <AppText variant="capLarge" muted accessibilityRole="header">
          {title}
        </AppText>
        {action === undefined ? null : (
          <Pressable testID="mark-all-read" accessibilityRole="button" onPress={action.onPress} hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }}>
            <AppText variant="cap" muted>
              {action.label}
            </AppText>
          </Pressable>
        )}
      </View>
      {entries.map((entry, i) => (
        <InboxRow key={entry.id} entry={entry} today={today} first={i === 0} onOpen={onOpen} />
      ))}
    </View>
  );
}

export default function NotificationsScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { inbox, userData, notificationPermission, markInboxRead, clearInbox, refreshNotifications } = useAppData();
  const [filter, setFilter] = useState<Filter>('all');
  const prefs = userData.notifications;
  const enabled = prefs.enabled && notificationPermission === 'granted';
  const todayKey = localDay(new Date());

  useEffect(() => {
    void refreshNotifications();
  }, [refreshNotifications]);

  const shown = filter === 'all' ? inbox : inbox.filter((entry) => FILTER_OF[entry.kind] === filter);
  const todays = shown.filter((entry) => localDay(new Date(entry.at)) === todayKey);
  const earlier = shown.filter((entry) => localDay(new Date(entry.at)) !== todayKey);
  const anyUnread = inbox.some((entry) => !entry.read);
  const markAll = anyUnread ? { label: t('home.notif.markAllRead'), onPress: () => void markInboxRead() } : undefined;
  const open = (entry: InboxEntry): void => {
    if (!entry.read) void markInboxRead([entry.id]);
    router.push(targetOf(entry.kind));
  };

  return (
    <Page
      title={t('home.notifications')}
      testID="notifications"
      right={<IconButton icon="gear" label={t('home.notif.settingsA11y')} color={colors.text} onPress={() => router.push('/settings/app')} testID="notifications-settings" />}>
      <Segmented<Filter>
        testID="notification-filter"
        value={filter}
        onChange={setFilter}
        options={FILTERS.map((option) => ({ value: option, label: t(`home.notif.${option}`), testID: `filter-${option}` }))}
      />

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
        <>
          {markAll === undefined ? null : (
            <View style={{ alignItems: 'flex-end' }}>
              <Pressable testID="mark-all-read" accessibilityRole="button" onPress={markAll.onPress} hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }}>
                <AppText variant="cap" muted>
                  {markAll.label}
                </AppText>
              </Pressable>
            </View>
          )}
          <Card tone="outline" style={{ gap: 6 }} testID="inbox-empty">
            <AppText variant="bodyStrong">{t('home.notif.emptyTitle')}</AppText>
            <AppText variant="label" muted>
              {t('home.notif.emptyBody')}
            </AppText>
          </Card>
        </>
      ) : (
        <View testID="inbox-list" style={{ gap: spacing.sm }}>
          <Group title={t('home.notif.today')} entries={todays} today action={markAll} onOpen={open} testID="group-today" />
          <Group title={t('home.notif.earlier')} entries={earlier} today={false} action={todays.length === 0 ? markAll : undefined} onOpen={open} testID="group-earlier" />
        </View>
      )}

      <Card style={{ gap: 6, backgroundColor: colors.surfaceAlt }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Icon name="bell" color={colors.textMuted} size={16} />
          <AppText variant="bodyStrong">{t('home.notif.quietTitle')}</AppText>
        </View>
        <AppText variant="label" muted>
          {t('home.notif.quietBody', { start: prefs.quietStart, end: prefs.quietEnd })}
        </AppText>
      </Card>

      {inbox.length > 0 ? <Button variant="secondary" label={t('home.notif.clear')} onPress={() => void clearInbox()} testID="inbox-clear" /> : null}
    </Page>
  );
}
