/**
 * Expo CLI solo pasa `-allowProvisioningUpdates` a xcodebuild cuando el proyecto **no** tiene
 * `DEVELOPMENT_TEAM` en buildSettings (ver configureCodeSigning.js → isCodeSigningConfigured).
 * Si `ios.appleTeamId` deja el team fijado en prebuild, Expo omite ese flag y el build a
 * dispositivo falla sin perfil.
 *
 * Aquí: firma automática + quitar team del pbxproj para que `expo run:ios` resuelva cert
 * y regenere perfiles con los flags correctos.
 */
const { withXcodeProject } = require('@expo/config-plugins');
const {
  getBuildConfigurationsForListId,
  getProjectSection,
  isNotComment,
} = require('@expo/config-plugins/build/ios/utils/Xcodeproj');
const { findSignableTargets } = require('@expo/config-plugins/build/ios/Target');

function withIosAutomaticSigning(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const targets = findSignableTargets(project);

    for (const [, nativeTarget] of targets) {
      getBuildConfigurationsForListId(project, nativeTarget.buildConfigurationList).forEach(
        ([, item]) => {
          if (!item.buildSettings.PRODUCT_NAME) return;
          item.buildSettings.CODE_SIGN_STYLE = 'Automatic';
          delete item.buildSettings.PROVISIONING_PROFILE_SPECIFIER;
          delete item.buildSettings.PROVISIONING_PROFILE;
          delete item.buildSettings.DEVELOPMENT_TEAM;
        },
      );
    }

    Object.entries(getProjectSection(project))
      .filter(isNotComment)
      .forEach(([, item]) => {
        if (!item.attributes?.TargetAttributes) return;
        for (const [nativeTargetId] of targets) {
          if (!item.attributes.TargetAttributes[nativeTargetId]) {
            item.attributes.TargetAttributes[nativeTargetId] = {};
          }
          const ta = item.attributes.TargetAttributes[nativeTargetId];
          ta.ProvisioningStyle = 'Automatic';
          delete ta.DevelopmentTeam;
        }
      });

    return cfg;
  });
}

module.exports = withIosAutomaticSigning;
