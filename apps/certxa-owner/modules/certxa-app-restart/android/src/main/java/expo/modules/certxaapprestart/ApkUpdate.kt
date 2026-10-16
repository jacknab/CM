package expo.modules.certxaapprestart

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageInstaller
import android.os.Build
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * "Install the latest app" from the manager menu: download the newest APK and install it over this one.
 *
 * As the tablet's device owner (kiosk-provisioned) Certxa installs it with no prompt; on other tablets Android
 * shows its own "Do you want to update this app?" screen. The download is checked before anything is
 * installed: it must be this same app (a different package would install a second app) and a newer build.
 * After the update Android ends this process; [ApkUpdateReceiver] opens the app again.
 */
object ApkUpdate {
  const val ACTION_STATUS = "expo.modules.certxaapprestart.APK_INSTALL_STATUS"
  private const val PREFS = "certxa_apk_update"

  private fun versionCode(info: PackageInfo): Long =
    if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else @Suppress("DEPRECATION") info.versionCode.toLong()

  /** Blocking (network + disk): call off the main thread. "installing" or "up_to_date"; throws with a message staff can read. */
  fun downloadAndInstall(context: Context, url: String): String {
    val file = File(context.cacheDir, "certxa-update.apk")
    download(url, file)
    val pm = context.packageManager
    val apk = pm.getPackageArchiveInfo(file.path, 0)
      ?: run { file.delete(); throw IllegalStateException("The download is not an Android app. Try again.") }
    if (apk.packageName != context.packageName) {
      file.delete()
      throw IllegalStateException("The download is a different app (${apk.packageName}), so it was not installed.")
    }
    if (versionCode(apk) <= versionCode(pm.getPackageInfo(context.packageName, 0))) {
      file.delete()
      return "up_to_date"
    }
    remember(context, "installing", "")
    val installer = pm.packageInstaller
    val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
      .apply { setAppPackageName(context.packageName) }
    val sessionId = installer.createSession(params)
    installer.openSession(sessionId).use { session ->
      session.openWrite("base.apk", 0, file.length()).use { out ->
        file.inputStream().use { it.copyTo(out) }
        session.fsync(out)
      }
      val status = Intent(context, ApkUpdateReceiver::class.java).setAction(ACTION_STATUS)
      // Android fills in the result, so the intent must stay mutable.
      val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
      session.commit(PendingIntent.getBroadcast(context, sessionId, status, flags).intentSender)
    }
    file.delete()
    return "installing"
  }

  /** Follows redirects (certxa.com/app sends the tablet on to the current build's file). */
  private fun download(url: String, file: File) {
    var current = URL(url)
    repeat(6) {
      val conn = (current.openConnection() as HttpURLConnection).apply {
        instanceFollowRedirects = false
        connectTimeout = 15_000
        readTimeout = 60_000
        // certxa.com/app sends Android devices the APK (other browsers get a download page).
        setRequestProperty("User-Agent", "CertxaApp (Linux; Android ${Build.VERSION.RELEASE})")
      }
      try {
        val code = conn.responseCode
        if (code in 300..399) {
          val next = conn.getHeaderField("Location") ?: throw IllegalStateException("The download link is broken.")
          current = URL(current, next)
          return@repeat
        }
        if (code !in 200..299) throw IllegalStateException("The download did not start (error $code). Try again later.")
        conn.inputStream.use { input -> file.outputStream().use { input.copyTo(it) } }
        return
      } finally {
        conn.disconnect()
      }
    }
    throw IllegalStateException("The download link went round in circles.")
  }

  fun remember(context: Context, state: String, message: String) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putString("state", state).putString("message", message).putLong("at", System.currentTimeMillis()).apply()
  }

  /** { state: "" | "installing" | "failed", message, at } — what the last update attempt came to. */
  fun lastResult(context: Context): Map<String, Any> {
    val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    return mapOf("state" to (p.getString("state", "") ?: ""), "message" to (p.getString("message", "") ?: ""), "at" to p.getLong("at", 0L).toDouble())
  }
}

/** The installer's answer. Android asking the person to confirm (not a device-owner tablet): show its screen. */
class ApkUpdateReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
      // Updated: Android ended the old app. Open the new one (as the Home app it is reopened anyway).
      ApkUpdate.remember(context, "", "")
      AppRelaunch.schedule(context, 1_000)
      return
    }
    when (val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
      PackageInstaller.STATUS_PENDING_USER_ACTION -> {
        @Suppress("DEPRECATION")
        val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT) ?: return
        context.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
      PackageInstaller.STATUS_SUCCESS -> ApkUpdate.remember(context, "", "")
      else -> {
        val reason = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: "error $status"
        ApkUpdate.remember(context, "failed", "The update was not installed: $reason")
      }
    }
  }
}
