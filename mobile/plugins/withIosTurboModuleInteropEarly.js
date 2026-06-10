/**
 * RN Nueva arquitectura + bridgeless: los módulos RCT (p. ej. RNAppleHealthKit) solo se
 * exponen al runtime JS si `RCTTurboModuleInteropEnabled` está activo en nativo.
 * Expo puede arrancar el host antes de la ruta que llama a RCTEnableTurboModuleInterop en
 * RCTRootViewFactory — lo forzamos al inicio de AppDelegate, antes de startReactNative.
 *
 * @see react-native/React/Base/RCTBridge.mm (RCTEnableTurboModuleInterop)
 * @see react-native/Libraries/AppDelegate/RCTRootViewFactory.mm (initializeReactHostWithLaunchOptions)
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = '// expo-healthkit-interop';

function withIosTurboModuleInteropEarly(config) {
  return withDangerousMod(config, [
    'ios',
    async (c) => {
      const root = c.modRequest.platformProjectRoot;
      const name = c.modRequest.projectName;
      if (!root || !name) return c;

      const swiftPath = path.join(root, name, 'AppDelegate.swift');
      if (!fs.existsSync(swiftPath)) return c;

      let body = fs.readFileSync(swiftPath, 'utf8');
      if (body.includes(MARKER)) return c;

      const injection = `
    ${MARKER}
    RCTEnableTurboModuleInterop(true)
    RCTEnableTurboModuleInteropBridgeProxy(true)

`;

      const pattern =
        /(\) -> Bool \{\n)(    let delegate = ReactNativeDelegate\(\))/;

      if (!pattern.test(body)) {
        console.warn(
          '[withIosTurboModuleInteropEarly] AppDelegate.swift no coincide con la plantilla esperada; no se inyectó interop.',
        );
        return c;
      }

      body = body.replace(pattern, `$1${injection}$2`);
      fs.writeFileSync(swiftPath, body);

      const bridgeHeader = path.join(root, name, `${name}-Bridging-Header.h`);
      if (fs.existsSync(bridgeHeader)) {
        let bh = fs.readFileSync(bridgeHeader, 'utf8');
        if (!bh.includes('RCTBridge.h')) {
          fs.writeFileSync(
            bridgeHeader,
            `${bh.trimEnd()}\n\n#import <React/RCTBridge.h>\n`,
          );
        }
      }

      return c;
    },
  ]);
}

module.exports = withIosTurboModuleInteropEarly;
