import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppState, Platform, SafeAreaView, StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import Board from './src/Board';
import TitleScreen from './src/TitleScreen';
import { GlobalBanner } from './src/GlobalBanner';
import { preloadRewardedAd } from './src/RewardedAdManager';

const isExpoGo = Constants.appOwnership === 'expo';

// iOS ATT dialog is only presented while the app is in the `active` state.
// During launch the app state is `inactive`, so calling the request too early
// silently returns `undetermined` without showing the prompt.
function waitForAppActive(timeoutMs = 3000): Promise<void> {
  if (AppState.currentState === 'active') return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      sub.remove();
      resolve();
    }, timeoutMs);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        clearTimeout(timer);
        sub.remove();
        resolve();
      }
    });
  });
}

/**
 * iOS: App Tracking Transparency プロンプト要求（初回起動時1回）→ AdMob SDK 初期化。
 * Android: AdMob SDK 初期化のみ（ATTは iOS 固有のため Platform.OS でガード）。
 * Expo Go では両方スキップ（native モジュール未バンドル）。
 */
async function initAdsAndTracking(): Promise<void> {
  if (isExpoGo) return;

  if (Platform.OS === 'ios') {
    try {
      const TrackingTransparency = require('expo-tracking-transparency');
      await waitForAppActive();
      await TrackingTransparency.requestTrackingPermissionsAsync();
    } catch (e) {
      console.warn('[Ads] ATT request failed:', e);
    }
  }

  try {
    const ads = require('react-native-google-mobile-ads');
    await ads.default().initialize();
  } catch (e) {
    console.warn('[Ads] mobileAds().initialize() failed:', e);
  }
}

export default function App() {
  const [started, setStarted] = useState(false);

  useEffect(() => {
    (async () => {
      await initAdsAndTracking();
      preloadRewardedAd();
    })();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.content}>
        {started ? <Board /> : <TitleScreen onStart={() => setStarted(true)} />}
      </View>
      <GlobalBanner />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  content: {
    flex: 1,
  },
});
