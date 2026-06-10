# Redirige el puerto 8000 del telefono (127.0.0.1:8000) al PC donde corre FastAPI.
# Uso: con el telefono por USB, pon en .env: EXPO_PUBLIC_API_URL=http://127.0.0.1:8000
# y ejecuta este script antes de abrir la app (o una vez por sesion de depuracion).

$adb = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"
if (-not (Test-Path $adb)) {
  Write-Error "No se encontro adb en $adb. Instala Android SDK Platform-Tools."
  exit 1
}
# adb suele imprimir el puerto en stdout en éxito; solo mostramos salida si falla.
$adbOut = & $adb reverse tcp:8000 tcp:8000 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Error ($adbOut | Out-String)
  exit $LASTEXITCODE
}
Write-Host "OK: el telefono puede usar http://127.0.0.1:8000 para el API (USB)."
