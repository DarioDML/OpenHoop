package app.openhoop.smartwake

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

internal const val CHECK_REQUEST = 7301
internal const val SHOW_REQUEST = 7302
internal const val PREFS = "openhoop_smart_wake"
internal const val PREF_TITLE = "title"
internal const val PREF_TEXT = "text"

internal fun checkIntent(context: Context): PendingIntent =
  PendingIntent.getBroadcast(
    context,
    CHECK_REQUEST,
    Intent(context, SmartWakeReceiver::class.java),
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
  )

private fun showIntent(context: Context): PendingIntent? {
  val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
  return PendingIntent.getActivity(context, SHOW_REQUEST, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
}

private fun canScheduleExact(manager: AlarmManager): Boolean =
  Build.VERSION.SDK_INT < Build.VERSION_CODES.S || manager.canScheduleExactAlarms()

class SmartWakeModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val alarms: AlarmManager
    get() = context.getSystemService(AlarmManager::class.java)

  override fun definition() = ModuleDefinition {
    Name("SmartWake")

    Function("canScheduleExact") {
      canScheduleExact(alarms)
    }

    Function("schedule") { atMs: Double, title: String, text: String ->
      val manager = alarms
      if (!canScheduleExact(manager)) return@Function false
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(PREF_TITLE, title.take(80)).putString(PREF_TEXT, text.take(200)).apply()
      manager.setAlarmClock(AlarmManager.AlarmClockInfo(atMs.toLong(), showIntent(context)), checkIntent(context))
      true
    }

    Function("cancel") {
      alarms.cancel(checkIntent(context))
    }
  }
}
