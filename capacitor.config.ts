import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.todica.app',
  appName: 'Todica',
  webDir: 'web/dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
