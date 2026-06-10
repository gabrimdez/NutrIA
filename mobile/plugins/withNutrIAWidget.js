/**
 * Expo config plugin that adds the NutrIAWidgetExtension target to the Xcode project.
 * Source files live in plugins/widget-src/ — they survive prebuild --clean.
 *
 * What this plugin does:
 *  1. Adds com.apple.security.application-groups to the main app entitlements.
 *  2. Copies widget Swift source + Info.plist into ios/NutrIAWidgetExtension/.
 *  3. Writes the widget entitlements file at ios/NutrIAWidgetExtension.entitlements.
 *  4. Writes the React Native bridge (Swift + ObjC) into ios/<AppName>/.
 *  5. Adds the NutrIAWidgetExtension target to project.pbxproj.
 *     NOTE: xcode's addTarget('app_extension') already handles:
 *       – "Copy Files" (Embed, dstSubfolderSpec=13) phase in main target
 *       – product reference in that phase
 *       – target dependency from main → widget
 *  6. Adds WidgetKit + SwiftUI frameworks to the extension target.
 *  7. Configures build settings (INFOPLIST_FILE, CODE_SIGN_ENTITLEMENTS, etc.).
 */

const { withXcodeProject, withEntitlementsPlist } = require('@expo/config-plugins');
const { getBuildConfigurationsForListId } = require('@expo/config-plugins/build/ios/utils/Xcodeproj');
const path = require('path');
const fs = require('fs');

const WIDGET_TARGET = 'NutrIAWidgetExtension';
const APP_GROUP = 'group.com.siwebai.nutria';
const SRC_DIR = path.join(__dirname, 'widget-src');

// ─── Entitlements file for the widget extension ───────────────────────────────

const WIDGET_ENTITLEMENTS = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.application-groups</key>
    <array>
        <string>${APP_GROUP}</string>
    </array>
</dict>
</plist>
`;

// ─── React Native bridge files ────────────────────────────────────────────────

const UPDATER_SWIFT = `import Foundation
import WidgetKit

@objc(NutrIAWidgetUpdater)
class NutrIAWidgetUpdater: NSObject {
    private let suiteName = "${APP_GROUP}"

    @objc
    func updateCalories(_ calories: NSInteger) {
        UserDefaults(suiteName: suiteName)?.set(calories, forKey: "caloriesLeft")
        UserDefaults(suiteName: suiteName)?.synchronize()
        WidgetCenter.shared.reloadTimelines(ofKind: "NutrIAWidget")
    }

    @objc
    static func requiresMainQueueSetup() -> Bool { false }
}
`;

const UPDATER_BRIDGE = `#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(NutrIAWidgetUpdater, NSObject)
RCT_EXTERN_METHOD(updateCalories:(NSInteger)calories)
@end
`;

// ─── Plugin entry point ───────────────────────────────────────────────────────

function withNutrIAWidget(config) {
  config = withEntitlementsPlist(config, addAppGroup);
  config = withXcodeProject(config, addWidgetTarget);
  return config;
}

// ─── Step 1: App Group entitlement on main app ────────────────────────────────

function addAppGroup(c) {
  const existing = Array.isArray(c.modResults['com.apple.security.application-groups'])
    ? c.modResults['com.apple.security.application-groups']
    : [];
  if (!existing.includes(APP_GROUP)) {
    c.modResults['com.apple.security.application-groups'] = [...existing, APP_GROUP];
  }
  return c;
}

// ─── Step 2: Xcode project modifications ─────────────────────────────────────

function addWidgetTarget(c) {
  const project  = c.modResults;
  const iosDir   = c.modRequest.platformProjectRoot;
  const appName  = c.modRequest.projectName;
  const bundleId = c.ios?.bundleIdentifier ?? 'com.siwebai.nutria';
  const widgetBundleId = `${bundleId}.widget`;

  // ── 2a. Write source files (idempotent) ───────────────────────────────────
  const widgetDir = path.join(iosDir, WIDGET_TARGET);
  fs.mkdirSync(widgetDir, { recursive: true });
  fs.copyFileSync(path.join(SRC_DIR, 'NutrIAWidget.swift'), path.join(widgetDir, 'NutrIAWidget.swift'));
  fs.copyFileSync(path.join(SRC_DIR, 'Info.plist'), path.join(widgetDir, 'Info.plist'));
  fs.writeFileSync(path.join(iosDir, `${WIDGET_TARGET}.entitlements`), WIDGET_ENTITLEMENTS);

  const mainDir = path.join(iosDir, appName);
  fs.writeFileSync(path.join(mainDir, 'NutrIAWidgetUpdater.swift'), UPDATER_SWIFT);
  fs.writeFileSync(path.join(mainDir, 'NutrIAWidgetUpdaterBridge.m'), UPDATER_BRIDGE);

  // ── 2b. Skip project edits if target already added ────────────────────────
  const nativeTargets = project.pbxNativeTargetSection();
  if (Object.values(nativeTargets).some(t => t?.name === WIDGET_TARGET)) return c;

  // ── 2c. Add widget extension target ───────────────────────────────────────
  // addTarget for 'app_extension' automatically:
  //   – creates "Copy Files" (plugins, dstSubfolderSpec=13) phase in main target
  //   – adds the .appex product to that phase
  //   – adds the target dependency main → widget
  // NOTE: addTarget leaves buildPhases:[] empty on the new target — we must
  //       add Sources/Frameworks phases ourselves before adding any files.
  const widgetTarget = project.addTarget(
    WIDGET_TARGET,
    'app_extension',
    WIDGET_TARGET,
    widgetBundleId
  );
  project.addBuildPhase([], 'PBXSourcesBuildPhase',    'Sources',    widgetTarget.uuid);
  project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', widgetTarget.uuid);
  project.addBuildPhase([], 'PBXResourcesBuildPhase',  'Resources',  widgetTarget.uuid);

  // ── 2d. Create PBXGroup for widget files and add to root group ────────────
  const widgetGroupKey = project.pbxCreateGroup(WIDGET_TARGET, WIDGET_TARGET);
  const rootGroupKey = project.getFirstProject().firstProject.mainGroup;
  const pbxGroups = project.hash.project.objects['PBXGroup'];
  const rootGroup = pbxGroups[rootGroupKey];
  if (rootGroup) {
    rootGroup.children.push({ value: widgetGroupKey, comment: WIDGET_TARGET });
  }

  // ── 2e. Add widget Swift source to widget target ──────────────────────────
  // Paths must be relative to their PBXGroup's path to avoid doubling the directory.
  const mainGroupKey = project.findPBXGroupKey({ name: appName }) || rootGroupKey;
  addSourceToTarget(project, 'NutrIAWidget.swift', widgetTarget.uuid, widgetGroupKey);

  // ── 2f. Add bridge files to main NutrIA target ────────────────────────────
  // The NutrIA PBXGroup has no `path`, so file paths must be fully qualified
  // relative to the project root (e.g. "NutrIA/NutrIAWidgetUpdater.swift").
  const mainTarget = project.getFirstTarget();
  addSourceToTarget(project, `${appName}/NutrIAWidgetUpdater.swift`,    mainTarget.uuid, mainGroupKey);
  addSourceToTarget(project, `${appName}/NutrIAWidgetUpdaterBridge.m`, mainTarget.uuid, mainGroupKey);

  // ── 2g. WidgetKit + SwiftUI frameworks for the extension ──────────────────
  project.addFramework('WidgetKit.framework', { target: widgetTarget.uuid });
  project.addFramework('SwiftUI.framework',   { target: widgetTarget.uuid });

  // ── 2h. Widget extension build settings ───────────────────────────────────
  getBuildConfigurationsForListId(
    project,
    widgetTarget.pbxNativeTarget.buildConfigurationList
  ).forEach(([, cfg]) => {
    delete cfg.buildSettings.GENERATE_INFOPLIST_FILE;
    Object.assign(cfg.buildSettings, {
      SWIFT_VERSION:              '5.0',
      IPHONEOS_DEPLOYMENT_TARGET: '16.0',
      TARGETED_DEVICE_FAMILY:     '"1,2"',
      INFOPLIST_FILE:             `"${WIDGET_TARGET}/Info.plist"`,
      CODE_SIGN_ENTITLEMENTS:     `"${WIDGET_TARGET}.entitlements"`,
      PRODUCT_BUNDLE_IDENTIFIER:  `"${widgetBundleId}"`,
      PRODUCT_NAME:               '"$(TARGET_NAME)"',
      SKIP_INSTALL:               'YES',
      CODE_SIGN_STYLE:            'Automatic',
      ENABLE_BITCODE:             'NO',
    });
  });

  return c;
}

/**
 * Add a source file to the project and wire it into a target's Sources build phase.
 * Uses project.addFile (avoids addPluginFile which crashes on missing "Plugins" group).
 */
function addSourceToTarget(project, filePath, targetUUID, groupKey) {
  const file = project.addFile(filePath, groupKey, {});
  if (!file) return; // already exists
  file.target = targetUUID;
  file.uuid = project.generateUuid();
  project.addToPbxBuildFileSection(file);
  project.addToPbxSourcesBuildPhase(file);
}

module.exports = withNutrIAWidget;
