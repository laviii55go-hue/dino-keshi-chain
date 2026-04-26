import AsyncStorage from '@react-native-async-storage/async-storage';
import { DinoCell, COLS, ROWS } from './gameLogic';

// --- ゲーム状態の保存・復元 ---

export interface SavedGameState {
  board: DinoCell[][];
  score: number;
  moves: number;
  level: number;
  skillStock: { type: number; key: string }[];
  savedAt: string;
}

const GAME_STATE_KEY = 'dino_chain_game_state';

export async function saveGameState(state: SavedGameState): Promise<void> {
  try {
    await AsyncStorage.setItem(GAME_STATE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('[Storage] save game state failed:', e);
  }
}

export async function loadGameState(): Promise<SavedGameState | null> {
  try {
    const json = await AsyncStorage.getItem(GAME_STATE_KEY);
    if (!json) return null;
    const state = JSON.parse(json) as SavedGameState;
    // バリデーション
    if (!state.board || state.board.length !== ROWS || state.board[0]?.length !== COLS) return null;
    if (typeof state.score !== 'number' || typeof state.moves !== 'number') return null;
    return state;
  } catch (e) {
    console.warn('[Storage] load game state failed:', e);
    return null;
  }
}

export async function clearGameState(): Promise<void> {
  try {
    await AsyncStorage.removeItem(GAME_STATE_KEY);
  } catch (e) {
    console.warn('[Storage] clear game state failed:', e);
  }
}

// --- ランキング ---

export interface RankingEntry {
  name: string;
  score: number;
  level: number;
  date: string;
}

const RANKING_KEY = 'dino_chain_ranking';
const MAX_RANKING = 10;

export async function loadRanking(): Promise<RankingEntry[]> {
  try {
    const json = await AsyncStorage.getItem(RANKING_KEY);
    if (!json) return [];
    return JSON.parse(json) as RankingEntry[];
  } catch (e) {
    console.warn('[Storage] load ranking failed:', e);
    return [];
  }
}

export async function addRankingEntry(entry: RankingEntry): Promise<{ ranking: RankingEntry[]; rank: number }> {
  const ranking = await loadRanking();
  ranking.push(entry);
  ranking.sort((a, b) => b.score - a.score);
  const rank = ranking.findIndex(r => r === entry) + 1;
  const trimmed = ranking.slice(0, MAX_RANKING);
  try {
    await AsyncStorage.setItem(RANKING_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.warn('[Storage] save ranking failed:', e);
  }
  return { ranking: trimmed, rank };
}

// --- ハイスコア ---

// --- プレイヤー名保存 ---

const PLAYER_NAME_KEY = 'dino_chain_player_name';

export async function loadPlayerName(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PLAYER_NAME_KEY);
  } catch {
    return null;
  }
}

export async function savePlayerName(name: string): Promise<void> {
  try {
    await AsyncStorage.setItem(PLAYER_NAME_KEY, name);
  } catch (e) {
    console.warn('[Storage] save player name failed:', e);
  }
}

// --- 設定 ---

const SETTINGS_KEY = 'dino_chain_settings';

export interface GameSettings {
  autoRegisterRanking: boolean; // true = 名前登録済みなら自動登録、false = 毎回確認
  showTutorialTips: boolean;    // true = 盤面下にチュートリアルTip表示、false = 非表示
  alwaysConfirmSkill: boolean;  // true = 初心者モード（スキル発動前に毎回確認）、false = 恐竜ごとにインストール後初回のみ確認
  soundEnabled: boolean;        // true = 効果音ON、false = ミュート
}

const DEFAULT_SETTINGS: GameSettings = { autoRegisterRanking: true, showTutorialTips: true, alwaysConfirmSkill: false, soundEnabled: true };

export async function loadSettings(): Promise<GameSettings> {
  try {
    const json = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!json) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(json) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: GameSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('[Storage] save settings failed:', e);
  }
}

// --- スキル学習フラグ（恐竜タイプごと独立・インストール後初回タップで確認POPUPを出すための判定） ---

const SKILL_LEARNED_KEY_PREFIX = 'dino_chain_skill_learned_';
const DINO_TYPE_COUNT = 6; // 0..5

export async function loadSkillLearned(type: number): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(`${SKILL_LEARNED_KEY_PREFIX}${type}`);
    return val === 'true';
  } catch {
    return false;
  }
}

export async function saveSkillLearned(type: number): Promise<void> {
  try {
    await AsyncStorage.setItem(`${SKILL_LEARNED_KEY_PREFIX}${type}`, 'true');
  } catch (e) {
    console.warn('[Storage] save skill learned failed:', e);
  }
}

export async function resetAllSkillLearned(): Promise<void> {
  try {
    const keys = Array.from({ length: DINO_TYPE_COUNT }, (_, i) => `${SKILL_LEARNED_KEY_PREFIX}${i}`);
    await AsyncStorage.multiRemove(keys);
  } catch (e) {
    console.warn('[Storage] reset all skill learned failed:', e);
  }
}

// --- ハイスコア ---

const HIGH_SCORE_KEY = 'dino_chain_high_score';

export async function loadHighScore(): Promise<number> {
  try {
    const val = await AsyncStorage.getItem(HIGH_SCORE_KEY);
    return val ? parseInt(val, 10) : 0;
  } catch {
    return 0;
  }
}

export async function saveHighScore(score: number): Promise<void> {
  try {
    const current = await loadHighScore();
    if (score > current) {
      await AsyncStorage.setItem(HIGH_SCORE_KEY, String(score));
    }
  } catch (e) {
    console.warn('[Storage] save high score failed:', e);
  }
}
