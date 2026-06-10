/**
 * Carga primero el .env del repo (Nutricionista/.env) y luego mobile/.env
 * para que EXPO_PUBLIC_API_URL / BACKEND_URL lleguen a la app vía `extra`.
 */
const path = require('path');

try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch {
  // dotenv no instalado o sin .env
}

module.exports = ({ config }) => ({
  ...config,
  /**
   * Orden: `withIosEntitlementsPersonalTeam` va **primero** en el array para registrarse antes
   * que expo-notifications / react-native-health; así el mod de entitlements queda **innermost**
   * y se ejecuta **último** (después de que los otros añadan push/HealthKit) y puede borrar claves.
   * `withIosAutomaticSigning` sigue al final del array (último registrado = firma/pbxproj).
   */
  plugins: [
    require('./plugins/withIosEntitlementsPersonalTeam.js'),
    require('./plugins/withNutrIAWidget.js'),
    ...(config.plugins || []),
    require('./plugins/withIosAutomaticSigning.js'),
    /** Después de firmar: parchea AppDelegate para interop legacy (HealthKit). */
    require('./plugins/withIosTurboModuleInteropEarly.js'),
  ],
  ios: {
    ...config.ios,
    /** IP del Mac para Metro en físico (opcional). `npx expo prebuild` copia a Info.plist como NutrIADevMetroHost. */
    infoPlist: {
      ...config.ios?.infoPlist,
      ...(process.env.DEV_METRO_HOST?.trim()
        ? { NutrIADevMetroHost: process.env.DEV_METRO_HOST.trim() }
        : {}),
    },
  },
  /** Health Connect (react-native-health-connect) exige minSdk ≥ 26. */
  android: {
    ...config.android,
    minSdkVersion: 26,
  },
  extra: {
    ...config.extra,
    /** Misma IP que Metro (DEV_METRO_HOST) → API en :8000; evita localhost en físico. */
    apiUrl:
      process.env.EXPO_PUBLIC_API_URL?.trim() ||
      process.env.BACKEND_URL?.trim() ||
      (process.env.DEV_METRO_HOST?.trim()
        ? `http://${process.env.DEV_METRO_HOST.trim()}:8000`
        : '') ||
      '',
    /** Solo web: si se define, sustituye la URL del API (p. ej. backend en otro host). */
    apiUrlWeb:
      process.env.EXPO_PUBLIC_API_URL_WEB?.trim() || '',
    googleWebClientId:
      process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() || '',
    googleIosClientId:
      process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() || '',
    googleAndroidClientId:
      process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim() || '',
  },
});
