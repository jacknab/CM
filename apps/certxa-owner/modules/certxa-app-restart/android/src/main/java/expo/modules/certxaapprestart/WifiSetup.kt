package expo.modules.certxaapprestart

import android.Manifest
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.ScanResult
import android.net.wifi.WifiConfiguration
import android.net.wifi.WifiManager
import android.os.Build
import android.provider.Settings

/**
 * Wi-Fi setup from inside Certxa, for the first step of the setup wizard (and the "Wi-Fi" button on
 * the "Could not load portal" screen).
 *
 * Joining a network from an app is something Android (10 and later) only lets a device owner do —
 * ordinary apps get a refusal from addNetwork/enableNetwork. So on a tablet provisioned with Certxa
 * as device owner this connects directly; on Android 9 and older any app may; on anything else
 * `canManage` is false and the screen sends the installer to Android's own Wi-Fi settings instead.
 *
 * Nothing here touches the kiosk lock or the device-owner provisioning: it only uses the device
 * owner standing the tablet already has. Every call is wrapped so a quirk in a tablet's Wi-Fi
 * stack returns "didn't work" to the screen instead of crashing the app.
 */
@Suppress("DEPRECATION")
object WifiSetup {
  private fun wifi(ctx: Context) = ctx.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
  private fun connectivity(ctx: Context) = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
  private fun dpm(ctx: Context) = ctx.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
  private fun admin(ctx: Context) = ComponentName(ctx, CertxaDeviceAdminReceiver::class.java)

  /** Can this app join a Wi-Fi network by itself on this tablet? */
  fun canManage(ctx: Context): Boolean =
    KioskMode.isDeviceOwner(ctx) || Build.VERSION.SDK_INT < Build.VERSION_CODES.Q

  private fun hasPermission(ctx: Context, permission: String) =
    ctx.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

  /** Android only returns the list of nearby networks to an app that holds the location permission. */
  fun canScan(ctx: Context): Boolean = hasPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION)

  /**
   * Get ready to scan and connect: Wi-Fi on, and — as device owner — the location permission granted
   * and location services on, without any Android prompt (a prompt cannot appear over the kiosk lock).
   */
  fun prepare(ctx: Context) {
    if (KioskMode.isDeviceOwner(ctx)) {
      val d = dpm(ctx)
      val a = admin(ctx)
      val permissions = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) permissions.add(Manifest.permission.NEARBY_WIFI_DEVICES)
      for (permission in permissions) {
        try {
          if (!hasPermission(ctx, permission)) {
            d.setPermissionGrantState(a, ctx.packageName, permission, DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED)
          }
        } catch (_: Throwable) { /* the screen still offers typing the network name by hand */ }
      }
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
          d.setLocationEnabled(a, true)
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
          d.setSecureSetting(a, Settings.Secure.LOCATION_MODE, Settings.Secure.LOCATION_MODE_HIGH_ACCURACY.toString())
        }
      } catch (_: Throwable) { /* scan results may be empty; manual entry still works */ }
    }
    try { if (!wifi(ctx).isWifiEnabled) wifi(ctx).isWifiEnabled = true } catch (_: Throwable) { }
  }

  private fun unquote(ssid: String?): String {
    val s = ssid ?: return ""
    if (s == WifiManager.UNKNOWN_SSID || s == "<unknown ssid>") return ""
    return if (s.length >= 2 && s.startsWith("\"") && s.endsWith("\"")) s.substring(1, s.length - 1) else s
  }

  /** The network this tablet is on now, or "" (also "" when Android will not say). */
  fun connectedSsid(ctx: Context): String =
    try { unquote(wifi(ctx).connectionInfo?.ssid) } catch (_: Throwable) { "" }

  /** Does Android consider the current connection usable (any transport: Wi-Fi, Ethernet, mobile)? */
  fun hasNetwork(ctx: Context): Boolean = try {
    val cm = connectivity(ctx)
    val caps = cm.activeNetwork?.let { cm.getNetworkCapabilities(it) }
    caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
  } catch (_: Throwable) { false }

  fun status(ctx: Context): Map<String, Any> = mapOf(
    "canManage" to canManage(ctx),
    "canScan" to canScan(ctx),
    "wifiEnabled" to (try { wifi(ctx).isWifiEnabled } catch (_: Throwable) { false }),
    "connectedSsid" to connectedSsid(ctx),
    "hasNetwork" to hasNetwork(ctx),
  )

  /** Ask Android for a fresh scan. Android limits how often this may happen, so a refusal is normal. */
  fun startScan(ctx: Context): Boolean = try { wifi(ctx).startScan() } catch (_: Throwable) { false }

  /** "open", "wep", "sae" (WPA3 only) or "wpa" (WPA/WPA2, including WPA2+WPA3 mixed networks). */
  private fun securityOf(result: ScanResult): String {
    val c = result.capabilities ?: ""
    return when {
      c.contains("PSK") -> "wpa"
      c.contains("SAE") -> "sae"
      c.contains("WEP") -> "wep"
      c.contains("EAP") -> "enterprise"
      else -> "open"
    }
  }

  /** Nearby networks, strongest first, one row per name. Empty when Android withholds the list. */
  fun scanResults(ctx: Context): List<Map<String, Any>> = try {
    val best = LinkedHashMap<String, ScanResult>()
    for (r in wifi(ctx).scanResults ?: emptyList()) {
      val ssid = r.SSID ?: continue
      if (ssid.isBlank()) continue
      val seen = best[ssid]
      if (seen == null || r.level > seen.level) best[ssid] = r
    }
    best.values.sortedByDescending { it.level }.map {
      mapOf(
        "ssid" to it.SSID,
        "bars" to WifiManager.calculateSignalLevel(it.level, 5),   // 0..4
        "security" to securityOf(it),
      )
    }
  } catch (_: Throwable) { emptyList() }

  private fun quoted(value: String) = "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

  /**
   * Save the network and switch to it. Returns "" when Android accepted the request (the screen then
   * watches for the connection and checks the internet), otherwise a short reason code.
   */
  fun connect(ctx: Context, ssid: String, password: String, security: String, hidden: Boolean): String {
    if (!canManage(ctx)) return "NOT_ALLOWED"
    if (ssid.isBlank()) return "NO_NAME"
    if (security == "enterprise") return "UNSUPPORTED"
    val wm = wifi(ctx)
    try { if (!wm.isWifiEnabled) wm.isWifiEnabled = true } catch (_: Throwable) { }

    val conf = WifiConfiguration()
    conf.SSID = quoted(ssid)
    conf.hiddenSSID = hidden
    when (security) {
      "open" -> conf.allowedKeyManagement.set(WifiConfiguration.KeyMgmt.NONE)
      "wep" -> {
        conf.allowedKeyManagement.set(WifiConfiguration.KeyMgmt.NONE)
        conf.allowedAuthAlgorithms.set(WifiConfiguration.AuthAlgorithm.OPEN)
        conf.allowedAuthAlgorithms.set(WifiConfiguration.AuthAlgorithm.SHARED)
        // A WEP key is either hex digits (unquoted) or text (quoted).
        conf.wepKeys[0] = if (password.matches(Regex("^[0-9A-Fa-f]+$")) && password.length in listOf(10, 26, 58)) password else quoted(password)
        conf.wepTxKeyIndex = 0
      }
      "sae" -> {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
          conf.setSecurityParams(WifiConfiguration.SECURITY_TYPE_SAE)
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          conf.allowedKeyManagement.set(WifiConfiguration.KeyMgmt.SAE)
        } else {
          return "UNSUPPORTED"   // WPA3 arrived with Android 10
        }
        conf.preSharedKey = quoted(password)
      }
      else -> {
        if (password.length < 8) return "SHORT_PASSWORD"
        conf.allowedKeyManagement.set(WifiConfiguration.KeyMgmt.WPA_PSK)
        conf.preSharedKey = quoted(password)
      }
    }

    // A network saved earlier under the same name (say, with a mistyped password) would win over the new one.
    try {
      for (old in wm.configuredNetworks ?: emptyList()) {
        if (old.SSID == conf.SSID) wm.removeNetwork(old.networkId)
      }
    } catch (_: Throwable) { }

    var networkId = -1
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && KioskMode.isDeviceOwner(ctx)) {
      try {
        val result = wm.addNetworkPrivileged(conf)
        if (result.statusCode == WifiManager.AddNetworkResult.STATUS_SUCCESS) networkId = result.networkId
      } catch (_: Throwable) { }
    }
    if (networkId == -1) {
      networkId = try { wm.addNetwork(conf) } catch (_: Throwable) { -1 }
    }
    if (networkId == -1) return "ADD_FAILED"

    return try {
      wm.disconnect()
      val enabled = wm.enableNetwork(networkId, true)
      wm.reconnect()
      if (enabled) "" else "ENABLE_FAILED"
    } catch (_: Throwable) { "ENABLE_FAILED" }
  }
}
