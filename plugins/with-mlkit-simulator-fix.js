const { withDangerousMod, withXcodeProject } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// GoogleMLKit's iOS pods (MLKitFaceDetection, MLKitVision, MLImage, ...) ship
// plain fat .framework binaries (arm64 + x86_64), not .xcframework, and have
// no CFBundleSupportedPlatforms to disambiguate device-arm64 from
// simulator-arm64 — so on an Apple Silicon Mac, Xcode can't resolve a valid
// arm64 iOS Simulator destination for any scheme that links them, and
// silently drops every concrete simulator from `xcodebuild -showdestinations`.
// Excluding arm64 for iphonesimulator forces the Simulator build onto the
// x86_64 slice (runs fine under Rosetta) so concrete simulators resolve again.
const MARKER = '# with-mlkit-simulator-fix';

function withPodsExcludedArchs(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf-8');
      if (contents.includes(MARKER)) return config;

      const snippet = `
    ${MARKER}
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |bc|
        bc.build_settings['EXCLUDED_ARCHS[sdk=iphonesimulator*]'] = 'arm64'
      end
    end
`;
      contents = contents.replace(
        /(post_install do \|installer\|\n)/,
        `$1${snippet}`,
      );
      fs.writeFileSync(podfilePath, contents);
      return config;
    },
  ]);
}

// The Pods-side exclusion above only touches Pods.xcodeproj — the main app
// target (in the app's own .xcodeproj) still defaults to arm64-only for
// iphonesimulator and would fail to link against the now-x86_64-only MLKit
// pods without the same exclusion applied here too.
function withAppExcludedArchs(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const configurations = project.pbxXCBuildConfigurationSection();
    for (const key in configurations) {
      const entry = configurations[key];
      if (typeof entry === 'object' && entry.buildSettings) {
        // Conditional build-setting keys (the `[sdk=...]` suffix) must be
        // quoted in pbxproj syntax — the xcode library writes object keys
        // verbatim with no auto-quoting, so the quotes have to be part of
        // the key string itself or this produces unparsable output.
        entry.buildSettings['"EXCLUDED_ARCHS[sdk=iphonesimulator*]"'] = 'arm64';
      }
    }
    return config;
  });
}

module.exports = function withMlkitSimulatorFix(config) {
  config = withPodsExcludedArchs(config);
  config = withAppExcludedArchs(config);
  return config;
};
