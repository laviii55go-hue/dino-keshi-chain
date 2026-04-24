import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ImageBackground,
  StyleSheet,
} from 'react-native';
import { DINO_IMAGES } from './dinoImages';

// app.json から version を直接取得（バンプ忘れ防止）
const appJson = require('../app.json');
const VERSION = `v${appJson.expo.version}`;

interface Props {
  onStart: () => void;
}

export default function TitleScreen({ onStart }: Props) {
  const [dinoIdx] = useState(() => Math.floor(Math.random() * DINO_IMAGES.length));

  return (
    <ImageBackground
      source={require('../assets/images/bg_jungle_opt.jpg')}
      style={styles.screen}
      resizeMode="cover"
    >
      <View style={styles.overlay} />
      <View style={styles.content}>
        <View style={styles.titleBox}>
          <Text style={styles.title}>🦕 恐竜けし連鎖</Text>
        </View>
        <Text style={styles.subtitle}>つなげて消す、恐竜パズルアドベンチャー</Text>

        <Image source={DINO_IMAGES[dinoIdx]} style={styles.hero} resizeMode="contain" />

        <TouchableOpacity
          style={styles.startButton}
          activeOpacity={0.85}
          onPress={onStart}
        >
          <Text style={styles.startButtonText}>🦕 ゲームスタート</Text>
        </TouchableOpacity>

        <Text style={styles.version}>{VERSION}</Text>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  content: { alignItems: 'center', padding: 24, width: '100%' },
  titleBox: {
    backgroundColor: 'rgba(26,26,46,0.85)',
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderWidth: 2,
    borderColor: '#FFD700',
    marginBottom: 10,
  },
  title: {
    color: '#FFD700',
    fontSize: 30,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
    letterSpacing: 1,
  },
  subtitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 24,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  hero: {
    width: 180,
    height: 180,
    marginBottom: 28,
  },
  startButton: {
    backgroundColor: '#e94560',
    borderRadius: 30,
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderWidth: 3,
    borderColor: '#FFD700',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  version: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 40,
    letterSpacing: 1,
  },
});
