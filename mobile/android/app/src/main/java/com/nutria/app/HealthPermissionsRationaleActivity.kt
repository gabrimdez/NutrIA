package com.nutria.app

import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity

/**
 * Pantalla de justificación de permisos de Health Connect (Android 14+).
 * Health Connect lanza [androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE]
 * cuando el usuario pulsa "Ver política de privacidad" o cuando el sistema
 * necesita mostrar por qué la app pide los permisos. Sin una actividad real
 * aquí, la redirección muestra una pantalla vacía y el flujo se rompe.
 */
class HealthPermissionsRationaleActivity : AppCompatActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContentView(R.layout.activity_health_permissions_rationale)
    findViewById<View?>(R.id.health_rationale_close)?.setOnClickListener { finish() }
  }
}
