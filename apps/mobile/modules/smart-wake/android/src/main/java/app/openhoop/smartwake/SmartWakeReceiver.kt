package app.openhoop.smartwake

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

class SmartWakeReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    ContextCompat.startForegroundService(context, Intent(context, SmartWakeTaskService::class.java))
  }
}
