import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { useAppData } from '@/data/context';
import type { WearLocation } from '@/data/userData';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Icon } from '@/ui/Icon';
import { CheckPill } from '@/ui/manage/CheckPill';
import { OnboardingPage } from '@/ui/manage/OnboardingPage';
import { radius, spacing, useTheme } from '@/ui/theme';

type Place = 'wrist' | 'bicep' | 'garment';

const GARMENT_LOCATIONS: readonly WearLocation[] = ['torso', 'waist', 'calf'];

const PLACES: ReadonlyArray<{ place: Place; location: WearLocation; title: TranslationKey; body: TranslationKey }> = [
  { place: 'wrist', location: 'wrist', title: 'onboarding.wear.wrist', body: 'onboarding.wear.wristBody' },
  { place: 'bicep', location: 'bicep', title: 'onboarding.wear.bicep', body: 'onboarding.wear.bicepBody' },
  { place: 'garment', location: 'torso', title: 'onboarding.wear.garment', body: 'onboarding.wear.garmentBody' },
];

const TIPS: readonly TranslationKey[] = ['onboarding.wear.tip1', 'onboarding.wear.tip2', 'onboarding.wear.tip3', 'onboarding.wear.tip4', 'onboarding.wear.tip5'];

function placeOf(location: WearLocation | null): Place | null {
  if (location === null) return null;
  return location === 'wrist' || location === 'bicep' ? location : 'garment';
}

function PlaceArt({ place }: { place: Place }) {
  const { colors } = useTheme();
  if (place === 'garment') {
    return (
      <Svg width={64} height={80} viewBox="0 0 64 80">
        <Path d="M10 14h44l-4 50H38l-6-26-6 26H14z" stroke={colors.textFaint} strokeWidth={2.5} fill="none" strokeLinejoin="round" />
        <Rect x={14} y={20} width={16} height={10} rx={4} fill={colors.accent} />
      </Svg>
    );
  }
  return (
    <Svg width={64} height={80} viewBox="0 0 64 80">
      <Path d="M22 4 C16 30 16 50 20 76 M42 4 C48 30 48 50 44 76" stroke={colors.textFaint} strokeWidth={2.5} fill="none" strokeLinecap="round" />
      <Rect x={15} y={place === 'wrist' ? 54 : 16} width={34} height={12} rx={5} fill={colors.accent} />
    </Svg>
  );
}

export default function WearGuideScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { userData, updateUserData } = useAppData();
  const [location, setLocation] = useState<WearLocation | null>(userData.wearLocation);
  const picked = placeOf(location);

  const choose = (next: WearLocation): void => {
    setLocation(next);
    void updateUserData({ wearLocation: next });
  };

  return (
    <OnboardingPage
      screen="wear"
      title={t('onboarding.wear.title')}
      subtitle={t('onboarding.wear.subtitle')}
      primary={{ label: t('onboarding.wear.done'), onPress: () => router.push('/onboarding/calibration'), testID: 'wear-done' }}>
      <View style={{ flexDirection: 'row', gap: 10 }} accessibilityRole="radiogroup">
        {PLACES.map((item) => {
          const selected = picked === item.place;
          return (
            <Pressable
              key={item.place}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${t(item.title)}, ${t(item.body)}`}
              onPress={() => {
                if (!selected) choose(item.location);
              }}
              testID={`wear-${item.place}`}
              style={({ pressed }) => ({
                flex: 1,
                minWidth: 0,
                alignItems: 'center',
                gap: spacing.sm,
                paddingVertical: 14,
                paddingHorizontal: spacing.sm,
                borderRadius: radius.md,
                borderWidth: 2,
                borderColor: selected ? colors.text : colors.borderStrong,
                backgroundColor: colors.surface,
                opacity: pressed ? 0.85 : 1,
              })}>
              <PlaceArt place={item.place} />
              <AppText variant="bodyStrong" style={{ fontSize: 14, textAlign: 'center' }}>
                {t(item.title)}
              </AppText>
              <AppText variant="caption" muted style={{ textAlign: 'center' }}>
                {t(item.body)}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      {picked === 'garment' ? (
        <View style={{ gap: spacing.sm }} testID="wear-garment-where">
          <AppText variant="capSmall" muted>
            {t('onboarding.wear.garmentWhere')}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {GARMENT_LOCATIONS.map((item) => (
              <CheckPill key={item} role="radio" label={t(`device.wear.${item}`)} selected={location === item} onPress={() => choose(item)} testID={`wear-${item}`} />
            ))}
          </View>
        </View>
      ) : null}
      {location !== null ? (
        <AppText variant="caption" muted testID="wear-note">
          {t('onboarding.wear.note')}
        </AppText>
      ) : null}
      <Card style={{ gap: spacing.md }} testID="wear-tips">
        <AppText variant="cardTitle">{t('onboarding.wear.tips')}</AppText>
        {TIPS.map((tip) => (
          <View key={tip} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <Icon name="check" color={colors.positive} size={20} strokeWidth={2.25} />
            <AppText variant="body" soft style={{ flex: 1 }}>
              {t(tip)}
            </AppText>
          </View>
        ))}
      </Card>
    </OnboardingPage>
  );
}
