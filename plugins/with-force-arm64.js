const { withXcodeProject, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = '# with-force-arm64';

function withPodsForceArm64(config) {
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
        bc.build_settings['ARCHS'] = 'arm64'
        bc.build_settings['ONLY_ACTIVE_ARCH'] = 'YES'
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

// Something about this specific project's Xcode metadata makes both
// `xcodebuild -showdestinations` and default arch resolution behave as if
// this Mac were Intel — `-showdestinations` only ever lists generic
// placeholders (never a concrete simulator, even though they're booted and
// visible to every other project on this machine), and an unmodified build
// silently links an x86_64 binary instead of arm64 even on Apple Silicon.
// Forcing ARCHS=arm64 via the xcodebuild command line breaks CocoaPods'
// generated embed-frameworks script (it reads `"${ARCHS[@]}"` as a bash
// array, and a raw command-line override arrives as a scalar env var under
// `set -u`, so it fails with "ARCHS[@]: unbound variable"). Setting it here,
// as a real project build setting, keeps it a proper Xcode-native
// multi-value setting that flows through correctly everywhere, including
// into that script's environment.
function withAppForceArm64(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const configurations = project.pbxXCBuildConfigurationSection();
    for (const key in configurations) {
      const entry = configurations[key];
      if (typeof entry === 'object' && entry.buildSettings) {
        entry.buildSettings.ARCHS = 'arm64';
        entry.buildSettings.ONLY_ACTIVE_ARCH = 'YES';
      }
    }
    return config;
  });
}

module.exports = function withForceArm64(config) {
  config = withAppForceArm64(config);
  config = withPodsForceArm64(config);
  return config;
};
