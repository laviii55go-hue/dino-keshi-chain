import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet } from 'react-native';
import Board from './src/Board';
import TitleScreen from './src/TitleScreen';

export default function App() {
  const [started, setStarted] = useState(false);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      {started ? <Board /> : <TitleScreen onStart={() => setStarted(true)} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
});
