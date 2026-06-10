/**
 * Firma con cuenta Apple **personal** (gratis): Xcode no genera perfil de desarrollo si el App ID
 * pide "HealthKit Access (Verifiable Health Records)" o Push, aunque no los uses.
 *
 * - `react-native-health` añade `com.apple.developer.healthkit.access` = [] aunque no haya datos
 *   clínicos; un array vacío basta para que falle el perfil. Lo quitamos si sigue vacío.
 * - Con `IOS_PERSONAL_TEAM=1` en `.env` se quita `aps-environment` (push remoto) para poder
 *   instalar en dispositivo. Notificaciones remotas requieren Apple Developer de pago o EAS
 *   con el team correcto.
 */
const { withEntitlementsPlist } = require('@expo/config-plugins');

function withIosEntitlementsPersonalTeam(config) {
  return withEntitlementsPlist(config, (c) => {
    const personal = process.env.IOS_PERSONAL_TEAM === '1';
    const access = c.modResults['com.apple.developer.healthkit.access'];
    // Equipo de pago: react-native-health suele dejar access=[]; vacío ya dispara VHR en el portal.
    if (Array.isArray(access) && access.length === 0) {
      delete c.modResults['com.apple.developer.healthkit.access'];
    }
    // Apple ID personal: sin perfil si queda VHR (healthkit.access) o push (aps-environment).
    if (personal) {
      delete c.modResults['com.apple.developer.healthkit.access'];
      delete c.modResults['aps-environment'];
    }
    return c;
  });
}

module.exports = withIosEntitlementsPersonalTeam;
