import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet, View } from 'react-native';
import Board from './src/Board';
import TitleScreen from './src/TitleScreen';
import { GlobalBanner } from './src/GlobalBanner';
import { preloadRewardedAd } from './src/RewardedAdManager';

export default function App() {
  const [started, setStarted] = useState(false);

  useEffect(() => {
    preloadRewardedAd();
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
