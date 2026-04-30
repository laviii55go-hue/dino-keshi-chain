// SDK 55 対応：expo-av → expo-audio 移行（2026/04/30 v1.3.0）
// 同期API（player.volume = N / player.play() / player.seekTo(0)）
import { createAudioPlayer, setAudioModeAsync, AudioPlayer, AudioSource } from 'expo-audio';

let soundVolume = 0.3;
let muted = false;
const allPlayers = new Set<AudioPlayer>();

export function setSoundVolume(v: number) {
  soundVolume = v;
  muted = v === 0;
  for (const p of allPlayers) {
    try {
      p.volume = v;
    } catch {}
  }
}

export function getSoundVolume() {
  return soundVolume;
}

const SE_SOURCES = {
  tick: require('../assets/audio/se_tick.mp3'),
  erase: require('../assets/audio/se_erase.mp3'),
  bomb: require('../assets/audio/se_bomb.mp3'),
  gameover: require('../assets/audio/se_gameover.mp3'),
  bonus: require('../assets/audio/se_bonus.mp3'),
  bonusBig: require('../assets/audio/se_bonus_big.mp3'),
  shuffle: require('../assets/audio/se_scratch.mp3'),
  levelUp: require('../assets/audio/se_henkou.mp3'),
};

let tickS: AudioPlayer | null = null;
let eraseS: AudioPlayer | null = null;
let bombS: AudioPlayer | null = null;
let gameoverS: AudioPlayer | null = null;
let bonusS: AudioPlayer | null = null;
let bonusBigS: AudioPlayer | null = null;
let shuffleS: AudioPlayer | null = null;
let levelUpS: AudioPlayer | null = null;
let seLoaded = false;

export async function loadSoundEffects() {
  if (seLoaded) return;
  try {
    await setAudioModeAsync({ playsInSilentMode: true });
    const vol = soundVolume;
    const load = (src: AudioSource): AudioPlayer => {
      const player = createAudioPlayer(src);
      try {
        player.volume = vol;
      } catch {}
      allPlayers.add(player);
      return player;
    };
    tickS = load(SE_SOURCES.tick);
    eraseS = load(SE_SOURCES.erase);
    bombS = load(SE_SOURCES.bomb);
    gameoverS = load(SE_SOURCES.gameover);
    bonusS = load(SE_SOURCES.bonus);
    bonusBigS = load(SE_SOURCES.bonusBig);
    shuffleS = load(SE_SOURCES.shuffle);
    levelUpS = load(SE_SOURCES.levelUp);
    seLoaded = true;
  } catch (e) {
    console.warn('SE load failed:', e);
  }
}

function playSE(player: AudioPlayer | null) {
  if (!player || muted) return;
  try {
    player.seekTo(0);
    player.play();
  } catch (e) {
    // フォールバック：再生失敗時は無視（ユーザー体験を妨げないため）
  }
}

export function playTick() { playSE(tickS); }
export function playErase() { playSE(eraseS); }
export function playBomb() { playSE(bombS); }
export function playBonus() { playSE(bonusS); }
export function playSkillActivate() { playSE(bonusBigS); }
export function playShuffle() { playSE(shuffleS); }
export function playLevelUp() { playSE(levelUpS); }
export function playGameOver() { playSE(gameoverS); }
