# Logcat filtrado para IME, insets e input. Requiere adb en PATH y dispositivo conectado.
# Uso:  .\scripts\android-logcat-ime.ps1
# Opcional:  .\scripts\android-logcat-ime.ps1 -Package com.tu.paquete

param(
  [string] $Package = ""
)

$ErrorActionPreference = "Stop"

$filters = @(
  "ImeTracker:V",
  "InputMethodManager:V",
  "InsetsController:V",
  "input_method:V"
)

if ($Package) {
  adb logcat -c
  adb logcat $filters *:S $Package":V" "*:S"
} else {
  Write-Host "Sin -Package: filtro genérico IME. Para ver solo la app, pasa -Package (applicationId de android/app/build.gradle o expo)." -ForegroundColor Yellow
  adb logcat -c
  adb logcat $filters "*:S"
}
