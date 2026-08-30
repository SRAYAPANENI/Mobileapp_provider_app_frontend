const { withGradleProperties } = require('expo/config-plugins');

// Expo's default template bundles all 4 ABIs (armeabi-v7a, arm64-v8a, x86,
// x86_64) into the APK — x86/x86_64 only exist to run on an emulator, never
// on a real device, and including them roughly quadruples the native library
// payload (this is what was pushing the provider app to ~170MB). The
// customer app already restricts this by hand-editing
// android/gradle.properties after prebuild; doing it here as a config plugin
// instead means it survives `expo prebuild --clean` regenerating that file
// from scratch, rather than needing the same manual edit reapplied forever.
const REAL_DEVICE_ARCHITECTURES = 'arm64-v8a';

module.exports = function withRealDeviceArchitecture(config) {
  return withGradleProperties(config, (config) => {
    const props = config.modResults;
    const key = 'reactNativeArchitectures';
    const existing = props.find((p) => p.type === 'property' && p.key === key);
    if (existing && existing.type === 'property') {
      existing.value = REAL_DEVICE_ARCHITECTURES;
    } else {
      props.push({ type: 'property', key, value: REAL_DEVICE_ARCHITECTURES });
    }
    return config;
  });
};
