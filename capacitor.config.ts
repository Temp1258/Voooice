import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vocaltext.app',
  appName: 'VocalText',
  webDir: 'dist',
  ios: {
    scheme: 'VocalText',
    allowsLinkPreview: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
    },
    Keyboard: {
      resize: 'body',
    },
    StatusBar: {
      style: 'light',
    },
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
