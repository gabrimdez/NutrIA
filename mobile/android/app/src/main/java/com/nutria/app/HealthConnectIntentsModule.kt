package com.nutria.app

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.health.connect.client.HealthConnectClient
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Puente para abrir pantallas específicas de Health Connect. La UI genérica
 * a veces no lista la app si aún no se ha otorgado ningún permiso, así que
 * exponemos dos entradas distintas con fallbacks robustos.
 */
class HealthConnectIntentsModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  @ReactMethod
  fun openManageHealthPermissionsForThisApp() {
    val activity = reactApplicationContext.currentActivity ?: return
    val packageName = activity.packageName

    if (Build.VERSION.SDK_INT >= 34) {
      if (startIntent(Intent("android.health.connect.action.MANAGE_HEALTH_PERMISSIONS").apply {
          putExtra(Intent.EXTRA_PACKAGE_NAME, packageName)
        })) return
      if (startIntent(Intent("android.health.connect.action.MANAGE_HEALTH_PERMISSIONS").apply {
          data = Uri.fromParts("package", packageName, null)
        })) return
    }

    openHealthConnectSettingsInternal()
  }

  @ReactMethod
  fun openHealthConnectSettings() {
    openHealthConnectSettingsInternal()
  }

  private fun openHealthConnectSettingsInternal(): Boolean {
    val activity = reactApplicationContext.currentActivity ?: return false

    if (startIntent(Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS))) return true

    try {
      val intent = HealthConnectClient.getHealthConnectManageDataIntent(reactApplicationContext)
      if (startIntent(intent)) return true
    } catch (_: Exception) { /* sigue a Play Store */ }

    if (startIntent(
        Intent(Intent.ACTION_VIEW).apply {
          data = Uri.parse("market://details?id=com.google.android.apps.healthdata")
        }
      )
    ) return true

    if (startIntent(
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
          data = Uri.fromParts("package", activity.packageName, null)
        }
      )
    ) return true

    return false
  }

  private fun startIntent(intent: Intent): Boolean {
    val activity = reactApplicationContext.currentActivity ?: return false
    return try {
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      activity.startActivity(intent)
      true
    } catch (_: Exception) {
      false
    }
  }

  companion object {
    const val NAME = "HealthConnectIntents"
  }
}
