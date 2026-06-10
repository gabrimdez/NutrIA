/**
 * Pasos de reproducción para el diagnóstico de parpadeo del teclado en Android.
 * No modificar el plan: solo referencia operativa.
 */
export const KEYBOARD_REPRO_CHECKLIST = `
Checklist (teclado IME en Android)
1) Pantallas de alto riesgo: (tabs)/chat, plan/weekly, plan, BottomSheet con búsqueda, login.
2) Pasos: abrir campo de texto, escribir varias líneas, observar si el teclado sube y baja solo.
3) Probar ADB inalámbrico o APK directo: si solo falla con USB depurando, anotar (herramienta de punteo/overlay).
4) Probar Gboard y otro IME; desactivar modo una mano si está activo.
5) Ruta mínima en __DEV__: abrir en la app /dev/keyboard-test y comparar.
` as const;
