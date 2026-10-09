package expo.modules.certxaapprestart

import android.app.Activity
import android.app.ActivityManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Handler
import android.os.Looper
import java.lang.ref.WeakReference

/**
 * Android's full kiosk lock (Lock Task mode). Only active on tablets where Certxa has been
 * provisioned as device owner — everywhere else every call here is a no-op.
 *
 * While locked: no Home / Recents buttons, no notification shade, no status bar info, and no
 * other app can open. The power menu stays so staff can still restart the tablet. Certxa is also
 * made the tablet's permanent Home app, so it's what comes back after a restart, crash or reboot.
 */
object KioskMode {
  /** Staff unlocked with the manager PIN: don't re-lock until this time (ms since epoch). */
  @Volatile private var unlockedUntil = 0L

  private fun admin(ctx: Context) = ComponentName(ctx, CertxaDeviceAdminReceiver::class.java)
  private fun dpm(ctx: Context) = ctx.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

  fun isDeviceOwner(ctx: Context): Boolean =
    try { dpm(ctx).isDeviceOwnerApp(ctx.packageName) } catch (_: Throwable) { false }

  /** Allow Certxa to lock itself without a prompt, and make it the permanent Home app. */
  fun applyPolicies(ctx: Context) {
    if (!isDeviceOwner(ctx)) return
    val d = dpm(ctx)
    val a = admin(ctx)
    d.setLockTaskPackages(a, arrayOf(ctx.packageName))
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      d.setLockTaskFeatures(a, DevicePolicyManager.LOCK_TASK_FEATURE_GLOBAL_ACTIONS)
    }
    val launcher = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.component ?: return
    val home = IntentFilter(Intent.ACTION_MAIN).apply {
      addCategory(Intent.CATEGORY_HOME)
      addCategory(Intent.CATEGORY_DEFAULT)
    }
    d.addPersistentPreferredActivity(a, home, launcher)
  }

  fun isLocked(ctx: Context): Boolean {
    val am = ctx.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    return am.lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE
  }

  /** Lock the app in (called whenever it comes to the foreground), unless staff unlocked it. */
  fun lock(activity: Activity) {
    if (!isDeviceOwner(activity) || System.currentTimeMillis() < unlockedUntil || isLocked(activity)) return
    activity.runOnUiThread { try { activity.startLockTask() } catch (_: Throwable) { /* next foreground retries */ } }
  }

  /**
   * Leave kiosk mode for `minutes` (manager PIN entered), then run `after` — Android only lets
   * another app (e.g. Settings) open once the lock has actually lifted. Re-locks on its own later.
   */
  fun unlock(activity: Activity?, minutes: Int, after: () -> Unit) {
    val ms = minutes.coerceIn(1, 60) * 60_000L
    unlockedUntil = System.currentTimeMillis() + ms
    if (activity == null) { after(); return }
    // Staff may come back to Certxa before the time is up — lock it again when it runs out.
    val ref = WeakReference(activity)
    Handler(Looper.getMainLooper()).postDelayed({
      ref.get()?.takeIf { !it.isFinishing && !it.isDestroyed }?.let { lock(it) }
    }, ms + 1_000)
    activity.runOnUiThread {
      try { if (isLocked(activity)) activity.stopLockTask() } catch (_: Throwable) { }
      after()
    }
  }
}
