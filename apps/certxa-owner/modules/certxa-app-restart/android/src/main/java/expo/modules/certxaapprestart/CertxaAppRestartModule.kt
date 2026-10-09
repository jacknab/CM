package expo.modules.certxaapprestart

import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class CertxaAppRestartModule : Module() {
  private val context get() = requireNotNull(appContext.reactContext) { "React context is not available" }

  override fun definition() = ModuleDefinition {
    Name("CertxaAppRestart")

    Function("isDefaultHome") { AppRelaunch.isDefaultHome(context) }

    /** Close the app completely and start it again fresh (a new process, not just a page reload). */
    Function("restart") {
      val ctx = context.applicationContext
      AppRelaunch.schedule(ctx, 1_500)
      Handler(Looper.getMainLooper()).postDelayed({ AppRelaunch.killSelf() }, 250)
    }

    /** Is this tablet provisioned for the full kiosk lock (Certxa is its device owner)? */
    Function("isKioskManaged") { KioskMode.isDeviceOwner(context) }

    /** Manager PIN entered: leave the kiosk lock for a few minutes and open Android's Settings. Re-locks on its own. */
    Function("exitKioskToSettings") { minutes: Int ->
      val ctx = context
      KioskMode.unlock(appContext.currentActivity, minutes) {
        ctx.startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
    }

    // Re-lock every time the app comes to the foreground (after a restart, a crash, or coming back from Settings).
    OnActivityEntersForeground { appContext.currentActivity?.let { KioskMode.lock(it) } }

    /** Android's own Settings — the way out when Certxa is the Home app (closing it just reopens it). */
    Function("openDeviceSettings") {
      val intent = Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    /**
     * Let this screen turn with the tablet even when Android's auto-rotate is switched off (staff
     * cannot reach that setting inside the kiosk lock). Used on POS / Kiosk tablets, where the way the
     * tablet is turned decides which of the two it shows.
     */
    Function("followSensorOrientation") {
      val activity = appContext.currentActivity
      activity?.runOnUiThread {
        try { activity.requestedOrientation = android.content.pm.ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR } catch (_: Throwable) { }
      }
    }

    /**
     * Stripe M2 card reader: as device owner, switch on Bluetooth and Location Services and grant the
     * app its location + Bluetooth permissions without a prompt (see ReaderSetup.kt). True when
     * Bluetooth was off and is now starting up.
     */
    Function("prepareCardReader") { ReaderSetup.prepare(context) }

    // ── Wi-Fi setup: first step of the setup wizard (see WifiSetup.kt, lib/wifi.ts) ──

    /** Wi-Fi on; as device owner also the location permission + location services, without a prompt. */
    Function("wifiPrepare") { WifiSetup.prepare(context) }

    /** { canManage, canScan, wifiEnabled, connectedSsid, hasNetwork } */
    Function("wifiStatus") { WifiSetup.status(context) }

    Function("wifiStartScan") { WifiSetup.startScan(context) }

    /** [{ ssid, bars 0..4, security }] strongest first. */
    Function("wifiScanResults") { WifiSetup.scanResults(context) }

    /** "" when Android accepted the request, otherwise a reason code. */
    Function("wifiConnect") { ssid: String, password: String, security: String, hidden: Boolean ->
      WifiSetup.connect(context, ssid, password, security, hidden)
    }

    /** Android's own Wi-Fi settings — for tablets where Certxa is not allowed to change Wi-Fi itself. */
    Function("openWifiSettings") {
      context.startActivity(Intent(Settings.ACTION_WIFI_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

  }
}
