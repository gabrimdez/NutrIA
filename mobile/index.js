// Metro primero (web/Fast Refresh). Luego RNGH + Reanimated antes del árbol de expo-router
// (evita Exception in HostFunction / NativeWorklets en dispositivo físico).
import './polyfills-native-interop.js';
import '@expo/metro-runtime';
import 'react-native-gesture-handler';
import 'react-native-reanimated';
import 'expo-router/entry';
