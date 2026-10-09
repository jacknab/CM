package expo.modules.certxaapprestart

import android.Manifest
import android.app.admin.DevicePolicyManager
import android.bluetooth.BluetoothManager
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings

/**
 * Gets the tablet ready for the Stripe M2 card reader, which needs Bluetooth on, Location Services
 * on, and the location + Bluetooth permissions. Inside the kiosk lock staff cannot reach Android's
 * settings to switch any of that on, so on a tablet where Certxa is device owner the app does it
 * itself, without prompts. On any other tablet this only reports — Android does not let an ordinary
 * app do these things, and the app's own permission prompts apply instead.
 *
 * Every call is wrapped: a tablet that refuses one of these still gets the others, and the reader
 * screen reports what is missing.
 */
@Suppress("DEPRECATION")
object ReaderSetup {
  private fun dpm(ctx: Context) = ctx.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
  private fun admin(ctx: Context) = ComponentName(ctx, CertxaDeviceAdminReceiver::class.java)

  private fun hasPermission(ctx: Context, permission: String) =
    ctx.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

  /** Returns true when Bluetooth was off and has just been asked to turn on (it takes a second or two). */
  fun prepare(ctx: Context): Boolean {
    if (!KioskMode.isDeviceOwner(ctx)) return false
    val d = dpm(ctx)
    val a = admin(ctx)

    val permissions = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      permissions.add(Manifest.permission.BLUETOOTH_SCAN)
      permissions.add(Manifest.permission.BLUETOOTH_CONNECT)
    }
    for (permission in permissions) {
      try {
        if (!hasPermission(ctx, permission)) {
          d.setPermissionGrantState(a, ctx.packageName, permission, DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED)
        }
      } catch (_: Throwable) { /* the reader screen asks for it the ordinary way */ }
    }

    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        d.setLocationEnabled(a, true)
      } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        d.setSecureSetting(a, Settings.Secure.LOCATION_MODE, Settings.Secure.LOCATION_MODE_HIGH_ACCURACY.toString())
      }
    } catch (_: Throwable) { }

    // Android 13 stopped ordinary apps switching Bluetooth on, but still allows a device owner.
    return try {
      val adapter = (ctx.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter
      if (adapter != null && !adapter.isEnabled) adapter.enable() else false
    } catch (_: Throwable) { false }
  }
}
