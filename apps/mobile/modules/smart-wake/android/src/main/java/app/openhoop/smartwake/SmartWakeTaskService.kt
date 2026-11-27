package app.openhoop.smartwake

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.facebook.react.ReactApplication
import com.facebook.react.ReactInstanceEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import com.facebook.react.jstasks.HeadlessJsTaskEventListener

private const val TASK_NAME = "OpenHoopSmartWake"
private const val TASK_TIMEOUT_MS = 180_000L
private const val WAKE_LOCK_MS = 200_000L
private const val CHANNEL_ID = "smart_wake"
private const val NOTIFICATION_ID = 7303

class SmartWakeTaskService : Service(), HeadlessJsTaskEventListener {
  private var taskId: Int? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private var context: ReactContext? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    startInForeground()
    if (taskId != null) return START_NOT_STICKY
    wakeLock = getSystemService(PowerManager::class.java)
      .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "OpenHoop:SmartWake")
      .apply { acquire(WAKE_LOCK_MS) }
    runTask()
    return START_NOT_STICKY
  }

  private fun startInForeground() {
    val manager = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(CHANNEL_ID) == null) {
      manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Smart wake", NotificationManager.IMPORTANCE_LOW))
    }
    val prefs = getSharedPreferences(PREFS, MODE_PRIVATE)
    val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle(prefs.getString(PREF_TITLE, null) ?: "OpenHoop")
      .setContentText(prefs.getString(PREF_TEXT, null) ?: "")
      .setOngoing(true)
      .setSilent(true)
      .build()
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE else 0
    ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, type)
  }

  private fun runTask() {
    val host = (application as ReactApplication).reactHost
    if (host == null) {
      finish()
      return
    }
    val current = host.currentReactContext
    if (current != null) {
      startTask(current)
      return
    }
    host.addReactInstanceEventListener(object : ReactInstanceEventListener {
      override fun onReactContextInitialized(context: ReactContext) {
        host.removeReactInstanceEventListener(this)
        startTask(context)
      }
    })
    host.start()
  }

  private fun startTask(reactContext: ReactContext) {
    context = reactContext
    val headless = HeadlessJsTaskContext.getInstance(reactContext)
    headless.addTaskEventListener(this)
    val config = HeadlessJsTaskConfig(TASK_NAME, Arguments.createMap(), TASK_TIMEOUT_MS, true)
    UiThreadUtil.runOnUiThread { taskId = headless.startTask(config) }
  }

  override fun onHeadlessJsTaskStart(taskId: Int) = Unit

  override fun onHeadlessJsTaskFinish(taskId: Int) {
    if (this.taskId == taskId) finish()
  }

  private fun finish() {
    context?.let { HeadlessJsTaskContext.getInstance(it).removeTaskEventListener(this) }
    context = null
    taskId = null
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  override fun onDestroy() {
    wakeLock?.let { if (it.isHeld) it.release() }
    super.onDestroy()
  }
}
