/**
 * RN bridgeless + Nueva arquitectura: sin esto, los módulos legacy (p. ej. RCTAppleHealthKit)
 * no entran en el fallback que usa `TurboModuleRegistry` → `NativeModules`, y
 * `react-native-health` no encuentra AppleHealthKit. Debe importarse antes que cualquier
 * otro paquete que cargue `react-native` (ver index.js).
 */
if (typeof global !== 'undefined') {
  global.RN$TurboInterop = true;
}
