package expo.modules.certxaapprestart

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.SystemClock

/**
 * Bringing the app back after it closes. The main mechanism is Android itself: when Certxa is the
 * tablet's default Home app, the system reopens it whenever its process ends (crash, restart,
 * reboot). The alarm scheduled here is a second path for the same thing.
 */
object AppRelaunch {
  private const val PREFS = "certxa_app_relaunch"
  private const val REQUEST_CODE = 7301

  fun schedule(context: Context, delayMs: Long) {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
    val pending = PendingIntent.getActivity(
      context, REQUEST_CODE, launch,
      PendingIntent.FLAG_CANCEL_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val alarms = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    alarms.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, SystemClock.elapsedRealtime() + delayMs, pending)
  }

  /** Is Certxa the app Android opens for the Home button (and after its process ends)? */
  fun isDefaultHome(context: Context): Boolean {
    val home = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
    val resolved = context.packageManager.resolveActivity(home, PackageManager.MATCH_DEFAULT_ONLY)
    return resolved?.activityInfo?.packageName == context.packageName
  }

  /** Crash-loop guard: at most 3 automatic relaunches after crashes in any 10 minutes. */
  fun allowCrashRelaunch(context: Context): Boolean {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val now = System.currentTimeMillis()
    val recent = (prefs.getString("crashes", "") ?: "")
      .split(",").mapNotNull { it.toLongOrNull() }.filter { now - it < 10 * 60 * 1000 }
    prefs.edit().putString("crashes", (recent + now).joinToString(",")).commit()
    return recent.size < 3
  }

  /** End this process now (after an optional relaunch was scheduled). */
  fun killSelf() {
    android.os.Process.killProcess(android.os.Process.myPid())
    kotlin.system.exitProcess(0)
  }
}
