import { Audio } from 'expo-av';

let soundVolume = 0.3;
let muted = false;
const allSounds = new Set<Audio.Sound>();

export function setSoundVolume(v: number) {
  soundVolume = v;
  muted = v === 0;
  for (const s of allSounds) {
    s.setVolumeAsync(v).catch(() => {});
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

let tickS: Audio.Sound | null = null;
let eraseS: Audio.Sound | null = null;
let bombS: Audio.Sound | null = null;
let gameoverS: Audio.Sound | null = null;
let bonusS: Audio.Sound | null = null;
let bonusBigS: Audio.Sound | null = null;
let shuffleS: Audio.Sound | null = null;
let levelUpS: Audio.Sound | null = null;
let seLoaded = false;

export async function loadSoundEffects() {
  if (seLoaded) return;
  try {
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    const vol = soundVolume;
    const load = async (src: any) => {
      const { sound } = await Audio.Sound.createAsync(src, { volume: vol });
      allSounds.add(sound);
      return sound;
    };
    [tickS, eraseS, bombS, gameoverS, bonusS, bonusBigS, shuffleS, levelUpS] =
      await Promise.all([
        load(SE_SOURCES.tick), load(SE_SOURCES.erase), load(SE_SOURCES.bomb),
        load(SE_SOURCES.gameover), load(SE_SOURCES.bonus), load(SE_SOURCES.bonusBig),
        load(SE_SOURCES.shuffle), load(SE_SOURCES.levelUp),
      ]);
    seLoaded = true;
  } catch (e) {
    console.warn('SE load failed:', e);
  }
}

function playSE(sound: Audio.Sound | null) {
  if (!sound || muted) return;
  sound.setPositionAsync(0)
    .then(() => sound.playAsync())
    .catch(() => sound.replayAsync?.({ positionMillis: 0 }).catch(() => {}));
}

export function playTick() { playSE(tickS); }
export function playErase() { playSE(eraseS); }
export function playBomb() { playSE(bombS); }
export function playBonus() { playSE(bonusS); }
export function playSkillActivate() { playSE(bonusBigS); }
export function playShuffle() { playSE(shuffleS); }
export function playLevelUp() { playSE(levelUpS); }
export function playGameOver() { playSE(gameoverS); }
