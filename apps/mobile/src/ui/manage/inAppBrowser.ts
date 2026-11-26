import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';

import type { ColorTokens } from '@/ui/theme';

export async function openInAppBrowser(url: string, colors: ColorTokens): Promise<boolean> {
  try {
    await WebBrowser.openBrowserAsync(url, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      toolbarColor: colors.background,
      controlsColor: colors.primary,
      dismissButtonStyle: 'done',
      showTitle: true,
      enableBarCollapsing: true,
    });
    return true;
  } catch {
    return Linking.openURL(url).then(
      () => true,
      () => false,
    );
  }
}
