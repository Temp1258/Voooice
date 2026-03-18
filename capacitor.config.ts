import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.voooice.app',
  appName: 'Voooice',
  webDir: 'dist',
  ios: {
    scheme: 'Voooice',
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
