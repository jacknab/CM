package expo.modules.certxaapprestart

import android.app.Application
import android.content.Context
import expo.modules.core.interfaces.ApplicationLifecycleListener
import expo.modules.core.interfaces.Package

/** Installs the crash relauncher and the kiosk policies as the app starts (registered automatically by Expo autolinking). */
class CertxaAppRestartPackage : Package {
  override fun createApplicationLifecycleListeners(context: Context?): List<ApplicationLifecycleListener> =
    listOf(object : ApplicationLifecycleListener {
      override fun onCreate(application: Application) {
        // Kiosk policies (device-owner tablets only): allow the lock without a prompt, Certxa as permanent Home.
        try { KioskMode.applyPolicies(application) } catch (_: Throwable) { /* never block app start */ }
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
          // An unexpected crash: schedule the app to come back, then let the crash proceed as usual
          // (Android's crash handling, logs). Guarded against crash loops.
          try {
            if (AppRelaunch.allowCrashRelaunch(application)) AppRelaunch.schedule(application, 2_000)
          } catch (_: Throwable) { /* never mask the original crash */ }
          if (previous != null) previous.uncaughtException(thread, error) else AppRelaunch.killSelf()
        }
      }
    })
}
