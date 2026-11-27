import 'expo-router/entry';
import { AppRegistry, Platform } from 'react-native';
import { registerWidgetTaskHandler } from 'react-native-android-widget';

import { appController } from './src/data/controller';
import { SMART_WAKE_TASK } from './src/lib/smartWakeNative';
import { widgetTaskHandler } from './src/widgets/taskHandler';

async function smartWakeTask(): Promise<void> {
  const controller = appController();
  await controller.start();
  await controller.smartWakeCheck();
}

if (Platform.OS === 'android') {
  registerWidgetTaskHandler(widgetTaskHandler);
  AppRegistry.registerHeadlessTask(SMART_WAKE_TASK, () => smartWakeTask);
}
