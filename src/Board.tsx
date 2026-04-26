import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  ImageBackground,
  Animated,
  StyleSheet,
  Dimensions,
  PanResponder,
  Switch,
  TouchableOpacity,
  TextInput,
  ScrollView,
  GestureResponderEvent,
  PanResponderGestureState,
} from 'react-native';
import {
  COLS,
  ROWS,
  INITIAL_MOVES,
  DinoCell,
  createBoard,
  createCell,
  cloneBoard,
  swapCells,
  findMatches,
  removeAndFill,
  calculateScore,
  getLevel,
  getNextLevelScore,
  getLevelUpBonus,
  MAX_STOCK,
  getSkillTriggerCount,
  DINO_NAMES,
  HERBIVORES,
  SkillStock,
  createSkillStock,
  ROCK_TYPE,
  ROCK_DESTROY_SCORE,
  ROCK_SPAWN_COUNT_PER_MILESTONE,
  getRockHpByLevel,
  shouldSpawnRocks,
  skillBreaksRock,
  spawnRocks,
  applyRockDamage,
} from './gameLogic';
import {
  saveGameState,
  loadGameState,
  clearGameState,
  loadRanking,
  addRankingEntry,
  loadHighScore,
  saveHighScore,
  loadPlayerName,
  savePlayerName,
  loadSettings,
  saveSettings,
  loadSkillLearned,
  saveSkillLearned,
  resetAllSkillLearned,
  GameSettings,
  RankingEntry,
} from './storage';
import Cell from './Cell';
import { DINO_IMAGES } from './dinoImages';
import SkillConfirmModal from './SkillConfirmModal';
import {
  loadSoundEffects,
  playTick,
  playErase,
  playBomb,
  playBonus,
  playSkillActivate,
  playShuffle,
  playLevelUp,
  playGameOver,
  setSoundVolume,
} from './sound';
import { fetchGlobalRankings, submitGlobalScore, type GlobalRankEntry, type RankPeriod } from './firebase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// チュートリアルTips（盤面下で順次スクロール表示）— 2026/04/25 改修: 基本ルール6件に絞り込み（スキル個別効果は確認POPUPへ移動）
const TUTORIAL_TIPS: { icon: string; text: string }[] = [
  { icon: '👆', text: '2つをタップで入れ替え。離れていてもOK' },
  { icon: '✨', text: '3つ以上並べると消える（直線3つ or 隣接4つ以上）' },
  { icon: '🔗', text: '落ちてきた恐竜で再び揃うと連鎖！2連鎖×2倍・3連鎖×3倍' },
  { icon: '❤️', text: '入れ替えるたびに手数-1／レベルアップで回復' },
  { icon: '🪨', text: '岩は入れ替え不可・隣接マッチや範囲攻撃でHP-1' },
  { icon: '🦖', text: '左のストックに恐竜が並んだらタップで発動！' },
];
const TIP_INTERVAL_MS = 7000; // 1 tip の表示時間（静止時間）
const TIP_SLIDE_MS = 800;     // スライドイン/アウトの時間（ゆっくりめ）
const BOARD_PADDING = 8;
const CELL_GAP = 3;
const STOCK_WIDTH_RATIO = 0.13; // ストック列が画面幅の13%
const STOCK_COL_WIDTH = Math.floor(SCREEN_WIDTH * STOCK_WIDTH_RATIO);
const AVAILABLE_WIDTH = SCREEN_WIDTH - BOARD_PADDING * 2 - STOCK_COL_WIDTH - CELL_GAP;
const CELL_SIZE = Math.floor((AVAILABLE_WIDTH - CELL_GAP * (COLS + 1)) / COLS);
const BOARD_WIDTH = CELL_SIZE * COLS + CELL_GAP * (COLS + 1);
const BOARD_HEIGHT = CELL_SIZE * ROWS + CELL_GAP * (ROWS + 1);
const STOCK_CELL_SIZE = Math.min(STOCK_COL_WIDTH - 8, CELL_SIZE);

const SWIPE_THRESHOLD = CELL_SIZE * 0.3;

const GLOW_MS = 400;
const REMOVE_MS = 200;
const SETTLE_MS = 300;

type Phase = 'idle' | 'glow' | 'remove' | 'settle' | 'skill-cutscene' | 'skill-target';

export default function Board() {
  const [board, setBoard] = useState<DinoCell[][]>(createBoard);
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(INITIAL_MOVES);
  const [level, setLevel] = useState(1);
  const [selectedCell, setSelectedCell] = useState<[number, number] | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [lastChain, setLastChain] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [matchedSet, setMatchedSet] = useState<Set<string>>(new Set());
  const [levelUpMsg, setLevelUpMsg] = useState<string | null>(null);
  const [swapTarget, setSwapTarget] = useState<[number, number] | null>(null);
  const [skillStock, setSkillStock] = useState<SkillStock[]>([]);
  const skillStockR = useRef(skillStock);
  const [activeSkill, setActiveSkill] = useState<{ type: number; index: number } | null>(null);
  const activeSkillR = useRef(activeSkill);
  const [skillPreview, setSkillPreview] = useState<Set<string>>(new Set());
  const [explodingSet, setExplodingSet] = useState<Set<string>>(new Set());
  const [showSkillHelp, setShowSkillHelp] = useState(false);
  const [showRanking, setShowRanking] = useState(false);
  const [skillOnlyMsg, setSkillOnlyMsg] = useState(false);
  const [showRetireConfirm, setShowRetireConfirm] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [highScore, setHighScore] = useState(0);
  const [playerName, setPlayerName] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showNameEdit, setShowNameEdit] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [settings, setSettings] = useState<GameSettings>({ autoRegisterRanking: true, showTutorialTips: true, alwaysConfirmSkill: false, soundEnabled: true });
  // スキル確認POPUP用: 慶さんの合意で「恐竜ごとインストール後初回のみ」表示・alwaysConfirmSkill=ONで常時表示
  const [pendingSkill, setPendingSkill] = useState<{ type: number; index: number } | null>(null);
  const [pendingGameOver, setPendingGameOver] = useState(false);
  const [skillCutscene, setSkillCutscene] = useState<number | null>(null);
  const skillSlideX = useRef(new Animated.Value(-300)).current;
  const skillCutsceneOpacity = useRef(new Animated.Value(0)).current;
  // パキケファロ頭突き演出（縦列落下スプライト）
  const [pachyAttackCol, setPachyAttackCol] = useState<number | null>(null);
  const pachyY = useRef(new Animated.Value(0)).current;
  // グローバルランキング
  const [globalRankings, setGlobalRankings] = useState<GlobalRankEntry[]>([]);
  const [rankTab, setRankTab] = useState<'local' | RankPeriod>('daily');
  const [globalLoading, setGlobalLoading] = useState(false);
  // 連鎖スペクタクル演出（バッジ拡大＋画面フラッシュ）
  const chainBadgeScale = useRef(new Animated.Value(1)).current;
  const chainFlashOpacity = useRef(new Animated.Value(0)).current;
  const chainHideTimeoutR = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 同時消し演出（1アクションで複数マッチグループが消えたときの別軸イベント）
  const [simulMatchCount, setSimulMatchCount] = useState(0);
  const simulBadgeScale = useRef(new Animated.Value(1)).current;
  const simulHideTimeoutR = useRef<ReturnType<typeof setTimeout> | null>(null);
  // チュートリアルTipカード（盤面下で自動スクロール）
  const [tipIdx, setTipIdx] = useState(0);
  const tipX = useRef(new Animated.Value(SCREEN_WIDTH)).current;

  // Refs
  const boardRef = useRef<View>(null);
  const boardOrigin = useRef({ x: 0, y: 0 });
  const boardR = useRef(board);
  const movesR = useRef(moves);
  const scoreR = useRef(score);
  const levelR = useRef(level);
  const selectedR = useRef(selectedCell);
  const phaseR = useRef(phase);
  const gameOverR = useRef(gameOver);

  useEffect(() => { boardR.current = board; }, [board]);
  useEffect(() => { movesR.current = moves; }, [moves]);
  useEffect(() => { scoreR.current = score; }, [score]);
  useEffect(() => { levelR.current = level; }, [level]);
  useEffect(() => { selectedR.current = selectedCell; }, [selectedCell]);
  useEffect(() => { phaseR.current = phase; }, [phase]);
  useEffect(() => { gameOverR.current = gameOver; }, [gameOver]);
  useEffect(() => { activeSkillR.current = activeSkill; }, [activeSkill]);
  useEffect(() => { skillStockR.current = skillStock; }, [skillStock]);

  // ランキングポップを開く共通ハンドラ（ローカル＋グローバル daily を同時ロード）
  const openRankingModal = useCallback(async () => {
    loadRanking().then(setRanking);
    setShowRanking(true);
    setRankTab('daily');
    setGlobalLoading(true);
    const data = await fetchGlobalRankings('daily');
    setGlobalRankings(data);
    setGlobalLoading(false);
  }, []);

  // チュートリアルTip: 右からスライドイン→静止→左へスライドアウト→次のTipへ
  // settings.showTutorialTips が false なら動作停止
  useEffect(() => {
    if (!settings.showTutorialTips) return;
    tipX.setValue(SCREEN_WIDTH);
    const anim = Animated.sequence([
      Animated.timing(tipX, { toValue: 0, duration: TIP_SLIDE_MS, useNativeDriver: true }),
      Animated.delay(TIP_INTERVAL_MS),
      Animated.timing(tipX, { toValue: -SCREEN_WIDTH, duration: TIP_SLIDE_MS, useNativeDriver: true }),
    ]);
    anim.start(({ finished }) => {
      if (finished) setTipIdx((i) => (i + 1) % TUTORIAL_TIPS.length);
    });
    return () => anim.stop();
  }, [tipIdx, tipX, settings.showTutorialTips]);

  // 連鎖スペクタクル：lastChain 変動時にバッジ拡大＋画面フラッシュ＋音階段
  useEffect(() => {
    if (lastChain < 2) {
      chainBadgeScale.setValue(1);
      return;
    }
    // バッジ pop アニメ
    chainBadgeScale.setValue(0.4);
    Animated.sequence([
      Animated.timing(chainBadgeScale, { toValue: 1.35, duration: 160, useNativeDriver: true }),
      Animated.timing(chainBadgeScale, { toValue: 1.0, duration: 140, useNativeDriver: true }),
    ]).start();

    // 画面フラッシュ（3連鎖以上で強度アップ）
    if (lastChain >= 3) {
      const intensity = Math.min(0.15 + (lastChain - 3) * 0.1, 0.55);
      chainFlashOpacity.setValue(0);
      Animated.sequence([
        Animated.timing(chainFlashOpacity, { toValue: intensity, duration: 70, useNativeDriver: true }),
        Animated.timing(chainFlashOpacity, { toValue: 0, duration: 240, useNativeDriver: true }),
      ]).start();
    }

    // 音階段
    if (lastChain >= 5) {
      playSkillActivate();
      setTimeout(() => playBomb(), 60);
    } else if (lastChain >= 4) {
      playBomb();
    }
  }, [lastChain, chainBadgeScale, chainFlashOpacity]);

  // 起動時にセーブデータ＋ハイスコア＋ランキング＋名前＋設定を読み込み
  useEffect(() => {
    (async () => {
      const [saved, hs, rk, name, sett] = await Promise.all([
        loadGameState(),
        loadHighScore(),
        loadRanking(),
        loadPlayerName(),
        loadSettings(),
      ]);
      if (saved) {
        setBoard(saved.board);
        setScore(saved.score);
        setMoves(saved.moves);
        setLevel(saved.level);
        setSkillStock(saved.skillStock || []);
      }
      setHighScore(hs);
      setRanking(rk);
      if (name) setPlayerName(name);
      setSettings(sett);
      setSoundVolume(sett.soundEnabled ? 0.3 : 0);
      setIsLoaded(true);
      loadSoundEffects();
    })();
  }, []);

  // ゲーム状態が変わるたびに自動保存（idle時のみ）
  useEffect(() => {
    if (!isLoaded || gameOver || phase !== 'idle') return;
    saveGameState({
      board,
      score,
      moves,
      level,
      skillStock,
      savedAt: new Date().toISOString(),
    });
  }, [board, score, moves, level, skillStock, phase, isLoaded, gameOver]);

  const triggerGameOver = useCallback(async () => {
    playGameOver();
    setGameOver(true);
    await saveHighScore(scoreR.current);
    const hs = await loadHighScore();
    setHighScore(hs);
    await clearGameState();

    const currentSettings = await loadSettings();
    const currentName = await loadPlayerName();

    if (currentName && currentSettings.autoRegisterRanking) {
      // 名前登録済み + 自動登録ON → 即ランキング登録（ローカル＋グローバル）
      const { ranking: newRanking } = await addRankingEntry({
        name: currentName,
        score: scoreR.current,
        level: levelR.current,
        date: new Date().toLocaleDateString('ja-JP'),
      });
      setRanking(newRanking);
      // グローバルランキング送信（失敗しても進行継続）
      submitGlobalScore(currentName, scoreR.current, levelR.current).catch(() => {});
    } else {
      // 名前未登録 or 毎回確認 → 名前入力ポップ表示
      setNameInput(currentName || '');
      setPendingGameOver(true);
      setShowNamePrompt(true);
    }
  }, []);

  const triggerGameOverRef = useRef(triggerGameOver);
  triggerGameOverRef.current = triggerGameOver;

  const handleNameRegister = useCallback(async () => {
    const name = nameInput.trim() || 'プレイヤー';
    setPlayerName(name);
    await savePlayerName(name);
    const { ranking: newRanking } = await addRankingEntry({
      name,
      score: scoreR.current,
      level: levelR.current,
      date: new Date().toLocaleDateString('ja-JP'),
    });
    setRanking(newRanking);
    // グローバルランキング送信
    submitGlobalScore(name, scoreR.current, levelR.current).catch(() => {});
    setShowNamePrompt(false);
    setPendingGameOver(false);
  }, [nameInput]);

  const handleNameSkip = useCallback(() => {
    setShowNamePrompt(false);
    setPendingGameOver(false);
  }, []);

  const handleRestart = useCallback(async () => {
    // プレイ中リスタートの場合、スコアがあればランキング登録
    if (!gameOverR.current && scoreR.current > 0 && playerName) {
      await saveHighScore(scoreR.current);
      const hs = await loadHighScore();
      setHighScore(hs);
      const { ranking: newRanking } = await addRankingEntry({
        name: playerName,
        score: scoreR.current,
        level: levelR.current,
        date: new Date().toLocaleDateString('ja-JP'),
      });
      setRanking(newRanking);
      submitGlobalScore(playerName, scoreR.current, levelR.current).catch(() => {});
    }
    setBoard(createBoard());
    setScore(0);
    setMoves(INITIAL_MOVES);
    setLevel(1);
    setSelectedCell(null);
    setSwapTarget(null);
    setSkillStock([]);
    setPhase('idle');
    setGameOver(false);
    setLastChain(0);
    setMatchedSet(new Set());
    setLevelUpMsg(null);
    setSkillOnlyMsg(false);
    clearGameState();
  }, [playerName]);

  // レベルアップ処理：手数ボーナス表示のみ（岩の実スポーンは removeAndFill 側で自然落下演出）
  const checkLevelUp = useCallback((newScore: number, currentMoves: number): number => {
    const oldLevel = levelR.current;
    const newLevel = getLevel(newScore);
    if (newLevel <= oldLevel) return 0;

    const bonus = getLevelUpBonus(newLevel);
    playLevelUp();
    setLevel(newLevel);
    setMoves(currentMoves + bonus);

    // 3レベルごとに岩スポーン通知（実配置は removeAndFill に委譲）
    let rockMsg = '';
    if (shouldSpawnRocks(newLevel)) {
      const hp = getRockHpByLevel(newLevel);
      rockMsg = ` / 🪨×${ROCK_SPAWN_COUNT_PER_MILESTONE}(♥${hp})`;
    }

    setLevelUpMsg(`Lv.${newLevel}! +${bonus}回${rockMsg}`);
    setTimeout(() => setLevelUpMsg(null), 1800);
    return bonus;
  }, []);

  const runNextStep = useCallback((currentBoard: DinoCell[][], chainCount: number, accScore: number, currentMoves: number) => {
    const matches = findMatches(currentBoard);
    if (matches.length === 0) {
      setPhase('idle');
      setMatchedSet(new Set());
      setLastChain(chainCount);
      // 連鎖バッジ自動消去：全連鎖一律800ms
      if (chainHideTimeoutR.current) clearTimeout(chainHideTimeoutR.current);
      if (chainCount >= 2) {
        chainHideTimeoutR.current = setTimeout(() => {
          setLastChain(0);
          chainHideTimeoutR.current = null;
        }, 800);
      }
      if (currentMoves <= 0 && skillStockR.current.length === 0) {
        triggerGameOverRef.current();
      }
      return;
    }
    // 連鎖中に次の消去が来たら自動消去タイマーをキャンセル
    if (chainHideTimeoutR.current) {
      clearTimeout(chainHideTimeoutR.current);
      chainHideTimeoutR.current = null;
    }

    const newChain = chainCount + 1;

    // マッチセル一覧を集約
    const allMatchedCells: [number, number][] = [];
    for (const m of matches) {
      for (const cell of m.cells) allMatchedCells.push(cell);
    }

    // 隣接岩へのダメージ適用（HP減算 or 破壊）
    const rockDmg = applyRockDamage(currentBoard, allMatchedCells);
    const boardWithRockDmg = rockDmg.board;
    const rockDestroyed = rockDmg.destroyed;
    const rockScoreBonus = rockDmg.score;

    // マッチ表示用：マッチセル＋破壊岩
    const matched = new Set<string>();
    for (const [r, c] of allMatchedCells) matched.add(`${r},${c}`);
    for (const [r, c] of rockDestroyed) matched.add(`${r},${c}`);

    setMatchedSet(matched);
    setPhase('glow');
    // 連鎖中にバッジを進行的に表示（2連鎖以降）
    if (newChain >= 2) {
      setLastChain(newChain);
      playBonus();
    }
    // 同時消し（1ステップで複数の独立マッチグループが消えた場合）
    if (matches.length >= 2) {
      setSimulMatchCount(matches.length);
      simulBadgeScale.setValue(0.4);
      Animated.sequence([
        Animated.timing(simulBadgeScale, { toValue: 1.3, duration: 140, useNativeDriver: true }),
        Animated.timing(simulBadgeScale, { toValue: 1.0, duration: 130, useNativeDriver: true }),
      ]).start();
      if (simulHideTimeoutR.current) clearTimeout(simulHideTimeoutR.current);
      simulHideTimeoutR.current = setTimeout(() => {
        setSimulMatchCount(0);
        simulHideTimeoutR.current = null;
      }, 800);
    }
    playErase();

    setTimeout(() => {
      const scoreGain = calculateScore(matches, newChain) + rockScoreBonus;
      const newScore = accScore + scoreGain;
      setScore(newScore);

      // スキル獲得判定（恐竜タイプごとに必要個数が異なる・案B採用）
      const newSkills: SkillStock[] = [];
      for (const m of matches) {
        const [mr, mc] = m.cells[0];
        const dinoType = currentBoard[mr][mc].type;
        if (dinoType === ROCK_TYPE) continue;
        if (m.cells.length >= getSkillTriggerCount(dinoType)) {
          newSkills.push(createSkillStock(dinoType));
        }
      }
      if (newSkills.length > 0) {
        setSkillStock(prev => {
          const updated = [...prev, ...newSkills];
          return updated.length > MAX_STOCK ? updated.slice(updated.length - MAX_STOCK) : updated;
        });
      }

      // 破壊岩をmatches形式に合流してremoveAndFillに渡す
      const combinedMatches = rockDestroyed.length > 0
        ? [...matches, { cells: rockDestroyed }]
        : matches;

      // マイルストーン到達を事前判定（落下スポーン用にremoveAndFillへ渡す）
      const oldLevel = levelR.current;
      const projectedLevel = getLevel(newScore);
      const willSpawnRocks = projectedLevel > oldLevel && shouldSpawnRocks(projectedLevel);
      const rockCount = willSpawnRocks ? ROCK_SPAWN_COUNT_PER_MILESTONE : 0;
      const rockHp = willSpawnRocks ? getRockHpByLevel(projectedLevel) : 1;

      setPhase('remove');

      setTimeout(() => {
        const { board: filled } = removeAndFill(boardWithRockDmg, combinedMatches, rockCount, rockHp);

        // レベルアップ表示＋手数ボーナス（岩は既にfilledに自然落下で含まれている）
        const bonus = checkLevelUp(newScore, currentMoves);
        const updatedMoves = currentMoves + bonus;

        setBoard(filled);
        setMatchedSet(new Set());
        setPhase('settle');

        setTimeout(() => {
          runNextStep(filled, newChain, newScore, updatedMoves);
        }, SETTLE_MS);
      }, REMOVE_MS);
    }, GLOW_MS);
  }, [checkLevelUp]);

  const processSwap = useCallback((r1: number, c1: number, r2: number, c2: number) => {
    if (phaseR.current !== 'idle' || gameOverR.current) return;
    if (r1 === r2 && c1 === c2) return;
    // 岩は入れ替え対象外
    const curBoard = boardR.current;
    if (curBoard[r1][c1].type === ROCK_TYPE || curBoard[r2][c2].type === ROCK_TYPE) {
      setSelectedCell(null);
      return;
    }
    // 新しい手 → 連鎖バッジ＋同時けしバッジを両方リセット＋タイマーもクリア
    if (chainHideTimeoutR.current) {
      clearTimeout(chainHideTimeoutR.current);
      chainHideTimeoutR.current = null;
    }
    if (simulHideTimeoutR.current) {
      clearTimeout(simulHideTimeoutR.current);
      simulHideTimeoutR.current = null;
    }
    setLastChain(0);
    setSimulMatchCount(0);
    // 手数0でスキルが残っている場合はメッセージ表示
    if (movesR.current <= 0) {
      setSkillOnlyMsg(true);
      setTimeout(() => setSkillOnlyMsg(false), 1500);
      setSelectedCell(null);
      return;
    }

    const cur = boardR.current;
    const swapped = swapCells(cur, r1, c1, r2, c2);
    const matches = findMatches(swapped);
    const newMoves = movesR.current - 1;

    // 回数は必ず消費
    setMoves(newMoves);
    setSelectedCell(null);

    if (matches.length === 0) {
      // マッチなし → 入れ替えは確定（手数消費済み）
      playShuffle();
      setBoard(swapped);
      if (newMoves <= 0 && skillStockR.current.length === 0) {
        setTimeout(() => triggerGameOverRef.current(), 200);
      }
      return;
    }

    setBoard(swapped);
    const currentScore = scoreR.current;

    setTimeout(() => {
      runNextStep(swapped, 0, currentScore, newMoves);
    }, 50);
  }, [runNextStep]);

  // スキル発動カットシーン → 効果実行
  const executeSkill = useCallback((skillType: number, target?: [number, number]) => {
    const cur = cloneBoard(boardR.current);
    const toRemove = new Set<string>();

    switch (skillType) {
      case 0: // ティラノ: 草食恐竜を全消し
        for (let r = 0; r < ROWS; r++)
          for (let c = 0; c < COLS; c++)
            if (HERBIVORES.includes(cur[r][c].type)) toRemove.add(`${r},${c}`);
        break;
      case 1: // ステゴ: 指定した種類を全消し
        if (target) {
          const targetType = cur[target[0]][target[1]].type;
          for (let r = 0; r < ROWS; r++)
            for (let c = 0; c < COLS; c++)
              if (cur[r][c].type === targetType) toRemove.add(`${r},${c}`);
        }
        break;
      case 2: // プテラ: ランダム10個消し
        {
          const all: [number, number][] = [];
          for (let r = 0; r < ROWS; r++)
            for (let c = 0; c < COLS; c++) all.push([r, c]);
          for (let i = all.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [all[i], all[j]] = [all[j], all[i]];
          }
          for (let k = 0; k < Math.min(10, all.length); k++)
            toRemove.add(`${all[k][0]},${all[k][1]}`);
        }
        break;
      case 3: // トリケラ: 横一列消し
        if (target) {
          for (let c = 0; c < COLS; c++) toRemove.add(`${target[0]},${c}`);
        }
        break;
      case 4: // スピノ: 自分+周囲8マス消し
        if (target) {
          for (let dr = -1; dr <= 1; dr++)
            for (let dc = -1; dc <= 1; dc++) {
              const nr = target[0] + dr, nc = target[1] + dc;
              if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS)
                toRemove.add(`${nr},${nc}`);
            }
        }
        break;
      case 5: // パキケファロ: 縦一直線 + 着弾点で周囲5マス
        if (target) {
          // 縦一列
          for (let r = 0; r < ROWS; r++) toRemove.add(`${r},${target[1]}`);
          // 着弾点（最下段）の周囲
          const impactR = ROWS - 1;
          const offsets: [number, number][] = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1]];
          for (const [dr, dc] of offsets) {
            const nr = impactR + dr, nc = target[1] + dc;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS)
              toRemove.add(`${nr},${nc}`);
          }
        }
        break;
    }

    // スキルと岩の関係：
    //  - 草食全消し(0)・種類指定(1) は岩対象外 → toRemove から岩を除外
    //  - 範囲攻撃系(2-5) は岩に隣接マッチと同じく -1 ダメージ（即破壊ではない・HP>0なら残存）
    if (!skillBreaksRock(skillType)) {
      for (const key of [...toRemove]) {
        const [r, c] = key.split(',').map(Number);
        if (cur[r][c].type === ROCK_TYPE) toRemove.delete(key);
      }
    } else {
      for (const key of [...toRemove]) {
        const [r, c] = key.split(',').map(Number);
        if (cur[r][c].type !== ROCK_TYPE) continue;
        const cell = cur[r][c];
        const newHp = (cell.hp ?? 1) - 1;
        if (newHp <= 0) {
          // HP0で破壊 → toRemove に残してそのまま除去
        } else {
          // ダメージのみ → HP更新して toRemove から除外（残存させる）
          cur[r][c] = { ...cell, hp: newHp };
          toRemove.delete(key);
        }
      }
    }

    if (toRemove.size === 0) {
      // Q1A: スキル使用時は +1 手数（何も消えなくても付与）
      setMoves(prev => prev + 1);
      return;
    }

    // 岩と通常セルで得点分離（岩=30点 / 通常=10点）
    const calcSkillScore = (): number => {
      let dinoCount = 0;
      let rockCount = 0;
      for (const key of toRemove) {
        const [r, c] = key.split(',').map(Number);
        if (cur[r][c].type === ROCK_TYPE) rockCount++;
        else dinoCount++;
      }
      return dinoCount * 10 + rockCount * ROCK_DESTROY_SCORE;
    };

    const isExplosion = skillType === 2; // プテラは爆発演出
    const isPachyCascade = skillType === 5 && !!target; // パキケファロは縦落下カスケード演出

    if (isPachyCascade && target) {
      // パキケファロ: 上から順に縦列をぼんぼんぼん消し → 最下段でどーん
      const targetCol = target[1];
      const cascadeDelay = 70; // ms per row
      const impactHoldMs = 380;

      // 列セル（上から） と 衝撃波セルを分離
      const columnCells: [number, number][] = [];
      for (let r = 0; r < ROWS; r++) columnCells.push([r, targetCol]);
      const impactCells: [number, number][] = [];
      const impactR = ROWS - 1;
      const offsets: [number, number][] = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1]];
      for (const [dr, dc] of offsets) {
        const nr = impactR + dr, nc = targetCol + dc;
        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) impactCells.push([nr, nc]);
      }

      // パキケファロ落下スプライト起動
      setPachyAttackCol(targetCol);
      pachyY.setValue(0);
      Animated.timing(pachyY, {
        toValue: (ROWS - 1) * (CELL_SIZE + CELL_GAP),
        duration: columnCells.length * cascadeDelay,
        useNativeDriver: true,
      }).start();

      setPhase('glow');
      const accumulated = new Set<string>();

      // 縦列を上から順に点灯（ぼん×N）
      for (let i = 0; i < columnCells.length; i++) {
        setTimeout(() => {
          const [r, c] = columnCells[i];
          accumulated.add(`${r},${c}`);
          setMatchedSet(new Set(accumulated));
          playErase();
        }, i * cascadeDelay);
      }

      const impactTime = columnCells.length * cascadeDelay;
      // 最下段到達 → どーん（衝撃波）
      setTimeout(() => {
        playBomb();
        for (const [r, c] of impactCells) accumulated.add(`${r},${c}`);
        setMatchedSet(new Set(accumulated));
        setExplodingSet(new Set(impactCells.map(([r, c]) => `${r},${c}`)));
      }, impactTime);

      // スコア加算＋残数+1＋実除去・fill・runNextStep
      setTimeout(() => {
        const scoreGain = calcSkillScore();
        setScore(prev => prev + scoreGain);
        setMoves(prev => prev + 1);
        setPachyAttackCol(null);
        setExplodingSet(new Set());
        setPhase('remove');

        setTimeout(() => {
          for (let c = 0; c < COLS; c++) {
            const remaining: DinoCell[] = [];
            for (let r = ROWS - 1; r >= 0; r--) {
              if (!toRemove.has(`${r},${c}`)) remaining.push(cur[r][c]);
            }
            for (let r = ROWS - 1; r >= 0; r--) {
              const idx = ROWS - 1 - r;
              cur[r][c] = idx < remaining.length ? remaining[idx] : createCell();
            }
          }
          setBoard(cur);
          setMatchedSet(new Set());
          setPhase('settle');

          setTimeout(() => {
            runNextStep(cur, 0, scoreR.current, movesR.current);
          }, SETTLE_MS);
        }, REMOVE_MS);
      }, impactTime + impactHoldMs);

      return;
    }

    if (isExplosion) {
      // 爆発演出: 時間差でバン！バン！と消える
      playBomb();
      setExplodingSet(toRemove);
      setPhase('glow');

      setTimeout(() => {
        const scoreGain = calcSkillScore();
        setScore(prev => prev + scoreGain);
        // Q1A: スキル発動 → 残数+1
        setMoves(prev => prev + 1);

        setTimeout(() => {
          setExplodingSet(new Set());
          for (let c = 0; c < COLS; c++) {
            const remaining: DinoCell[] = [];
            for (let r = ROWS - 1; r >= 0; r--) {
              if (!toRemove.has(`${r},${c}`)) remaining.push(cur[r][c]);
            }
            for (let r = ROWS - 1; r >= 0; r--) {
              const idx = ROWS - 1 - r;
              cur[r][c] = idx < remaining.length ? remaining[idx] : createCell();
            }
          }
          setBoard(cur);
          setPhase('settle');

          setTimeout(() => {
            runNextStep(cur, 0, scoreR.current, movesR.current);
          }, SETTLE_MS);
        }, 400); // 爆発アニメーション待ち
      }, 100);
    } else {
      // 通常のglow→remove→settle
      setMatchedSet(toRemove);
      setPhase('glow');

      setTimeout(() => {
        const scoreGain = calcSkillScore();
        setScore(prev => prev + scoreGain);
        // Q1A: スキル発動 → 残数+1
        setMoves(prev => prev + 1);

        setPhase('remove');

        setTimeout(() => {
          for (let c = 0; c < COLS; c++) {
            const remaining: DinoCell[] = [];
            for (let r = ROWS - 1; r >= 0; r--) {
              if (!toRemove.has(`${r},${c}`)) remaining.push(cur[r][c]);
            }
            for (let r = ROWS - 1; r >= 0; r--) {
              const idx = ROWS - 1 - r;
              cur[r][c] = idx < remaining.length ? remaining[idx] : createCell();
            }
          }
          setBoard(cur);
          setMatchedSet(new Set());
          setPhase('settle');

          setTimeout(() => {
            runNextStep(cur, 0, scoreR.current, movesR.current);
          }, SETTLE_MS);
        }, REMOVE_MS);
      }, GLOW_MS);
    }
  }, [runNextStep]);

  const SKILL_DESCRIPTIONS: Record<number, string> = {
    0: '草食恐竜 全消し!',
    1: '同種 全消し!',
    2: 'ランダム10個消し!',
    3: '横一列消し!',
    4: '周囲8マス消し!',
    5: '頭突き貫通!',
  };

  // スキルカットシーンを表示してから実行
  const playSkillCutscene = useCallback((skillType: number, stockIndex: number, target?: [number, number]) => {
    playSkillActivate();
    setSkillCutscene(skillType);
    setPhase('skill-cutscene');
    skillSlideX.setValue(-400);
    skillCutsceneOpacity.setValue(0);

    Animated.sequence([
      // 左から中央へスライドイン
      Animated.parallel([
        Animated.spring(skillSlideX, { toValue: 0, friction: 7, tension: 60, useNativeDriver: true }),
        Animated.timing(skillCutsceneOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]),
      // 中央で一瞬止まる
      Animated.delay(500),
      // 右へスライドアウト
      Animated.parallel([
        Animated.timing(skillSlideX, { toValue: 400, duration: 250, useNativeDriver: true }),
        Animated.timing(skillCutsceneOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]),
    ]).start(() => {
      setSkillCutscene(null);
      setSkillStock(prev => prev.filter((_, i) => i !== stockIndex));
      setActiveSkill(null);
      executeSkill(skillType, target);
    });
  }, [executeSkill]);

  // スキル発動のディスパッチ（即発動 or ターゲット選択モード）
  const executeSkillDispatch = useCallback((skillType: number, stockIndex: number) => {
    const needsTarget = [1, 3, 4, 5].includes(skillType); // ステゴ, トリケラ, スピノ, パキケファロ
    if (needsTarget) {
      setActiveSkill({ type: skillType, index: stockIndex });
      setPhase('skill-target');
      setSelectedCell(null);
    } else {
      // ティラノ, プテラ → 即発動
      playSkillCutscene(skillType, stockIndex);
    }
  }, [playSkillCutscene]);

  // ストックタップ → 確認POPUP要否を判定して分岐
  // 慶さん合意（2026/04/25）: 恐竜ごとに「インストール後の初回タップ」のみ確認POPUPを出す
  // 設定 alwaysConfirmSkill=ON の場合は常時POPUP（初心者モード）
  const onSkillTap = useCallback(async (stockIndex: number) => {
    if (phaseR.current !== 'idle' || gameOverR.current) return;
    const skill = skillStock[stockIndex];
    if (!skill) return;

    const alwaysConfirm = settings.alwaysConfirmSkill;
    const learned = await loadSkillLearned(skill.type);

    if (alwaysConfirm || !learned) {
      // 確認POPUP表示
      setPendingSkill({ type: skill.type, index: stockIndex });
      return;
    }

    // 学習済み＆初心者モードOFF → 従来通り即発動 or 選択モード
    executeSkillDispatch(skill.type, stockIndex);
  }, [skillStock, settings.alwaysConfirmSkill, executeSkillDispatch]);

  // 確認POPUPで「発動する」押下
  const onConfirmSkill = useCallback(async () => {
    if (!pendingSkill) return;
    const { type, index } = pendingSkill;
    await saveSkillLearned(type);
    setPendingSkill(null);
    executeSkillDispatch(type, index);
  }, [pendingSkill, executeSkillDispatch]);

  // 確認POPUPで「キャンセル」押下
  const onCancelSkill = useCallback(() => {
    setPendingSkill(null);
  }, []);

  // スキルの影響範囲を計算してプレビュー表示
  const calcSkillPreview = useCallback((skillType: number, r: number, c: number): Set<string> => {
    const preview = new Set<string>();
    const cur = boardR.current;
    switch (skillType) {
      case 1: // ステゴ: 同種全消し（岩は対象外）
        {
          const targetType = cur[r][c].type;
          if (targetType === ROCK_TYPE) break;
          for (let rr = 0; rr < ROWS; rr++)
            for (let cc = 0; cc < COLS; cc++)
              if (cur[rr][cc].type === targetType) preview.add(`${rr},${cc}`);
        }
        break;
      case 3: // トリケラ: 横一列
        for (let cc = 0; cc < COLS; cc++) preview.add(`${r},${cc}`);
        break;
      case 4: // スピノ: 周囲8マス+自分
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS)
              preview.add(`${nr},${nc}`);
          }
        break;
      case 5: // パキケファロ: 縦一直線+着弾点周囲
        for (let rr = 0; rr < ROWS; rr++) preview.add(`${rr},${c}`);
        {
          const impactR = ROWS - 1;
          const offsets: [number, number][] = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1]];
          for (const [dr, dc] of offsets) {
            const nr = impactR + dr, nc = c + dc;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS)
              preview.add(`${nr},${nc}`);
          }
        }
        break;
    }
    return preview;
  }, []);

  const calcSkillPreviewRef = useRef(calcSkillPreview);
  calcSkillPreviewRef.current = calcSkillPreview;

  // スキルターゲット選択時の盤面タップ（PanResponderから呼ばれるのでrefを使う）
  const onSkillTargetSelectRef = useRef<(r: number, c: number) => void>(() => {});
  onSkillTargetSelectRef.current = (r: number, c: number) => {
    const skill = activeSkillR.current;
    if (!skill) return;
    // ステゴ(種類全消し)は岩を対象にできない → プレビュー解除のみでスキル継続
    if (skill.type === 1 && boardR.current[r][c].type === ROCK_TYPE) {
      setSkillPreview(new Set());
      return;
    }
    setSkillPreview(new Set());
    setPhase('idle');
    playSkillCutscene(skill.type, skill.index, [r, c]);
  };

  const onSkillPreviewRef = useRef<(r: number, c: number) => void>(() => {});
  onSkillPreviewRef.current = (r: number, c: number) => {
    const skill = activeSkillR.current;
    if (!skill) return;
    setSkillPreview(calcSkillPreviewRef.current(skill.type, r, c));
  };

  const getCellFromPosition = useCallback((pageX: number, pageY: number): [number, number] | null => {
    const bx = pageX - boardOrigin.current.x;
    const by = pageY - boardOrigin.current.y;
    const c = Math.floor((bx - CELL_GAP) / (CELL_SIZE + CELL_GAP));
    const r = Math.floor((by - CELL_GAP) / (CELL_SIZE + CELL_GAP));
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) return [r, c];
    return null;
  }, []);

  const onBoardLayout = useCallback(() => {
    boardRef.current?.measure((_x, _y, _w, _h, px, py) => {
      boardOrigin.current = { x: px, y: py };
    });
  }, []);

  // Progress bar: score progress to next level
  const nextLevelScore = getNextLevelScore(level);
  const prevLevelScore = level >= 2 ? getNextLevelScore(level - 1) : 0;
  const progressRange = nextLevelScore - prevLevelScore;
  const progressCurrent = score - prevLevelScore;
  const progressPct = progressRange > 0 ? Math.min(progressCurrent / progressRange, 1) : 0;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => {
        const p = phaseR.current;
        return (p === 'idle' || p === 'skill-target') && !gameOverR.current;
      },
      onMoveShouldSetPanResponder: (_e, gs) => {
        const p = phaseR.current;
        if ((p !== 'idle' && p !== 'skill-target') || gameOverR.current) return false;
        if (p === 'skill-target') return true; // スキルモードでは常にmoveを追跡
        return Math.abs(gs.dx) > 5 || Math.abs(gs.dy) > 5;
      },
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        if (phaseR.current === 'skill-target') {
          const { pageX, pageY } = evt.nativeEvent;
          const cell = getCellFromPosition(pageX, pageY);
          if (cell) onSkillPreviewRef.current(cell[0], cell[1]);
        }
      },
      onPanResponderStart: (evt: GestureResponderEvent) => {
        if (phaseR.current === 'skill-target') {
          const { pageX, pageY } = evt.nativeEvent;
          const cell = getCellFromPosition(pageX, pageY);
          if (cell) onSkillPreviewRef.current(cell[0], cell[1]);
        }
      },
      onPanResponderMove: (evt: GestureResponderEvent) => {
        if (phaseR.current === 'skill-target') {
          const { pageX, pageY } = evt.nativeEvent;
          const cell = getCellFromPosition(pageX, pageY);
          if (cell) onSkillPreviewRef.current(cell[0], cell[1]);
        }
      },
      onPanResponderRelease: (evt: GestureResponderEvent, gs: PanResponderGestureState) => {
        const p = phaseR.current;
        if ((p !== 'idle' && p !== 'skill-target') || gameOverR.current) return;

        const { pageX, pageY } = evt.nativeEvent;

        // スキルターゲットモード: 指を離して発動
        if (p === 'skill-target') {
          const cell = getCellFromPosition(pageX, pageY);
          if (cell) {
            onSkillTargetSelectRef.current(cell[0], cell[1]);
          } else {
            setSkillPreview(new Set()); // 盤面外で離した場合はプレビュー解除のみ
          }
          return;
        }

        // 通常モード
        const { dx, dy } = gs;
        const startX = pageX - dx;
        const startY = pageY - dy;
        const cell = getCellFromPosition(startX, startY);
        if (!cell) return;

        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        if (absDx < SWIPE_THRESHOLD && absDy < SWIPE_THRESHOLD) {
          const sel = selectedR.current;
          if (sel) {
            if (sel[0] === cell[0] && sel[1] === cell[1]) {
              setSelectedCell(null);
            } else {
              playTick();
              setSwapTarget(cell);
              setTimeout(() => {
                setSwapTarget(null);
                processSwap(sel[0], sel[1], cell[0], cell[1]);
              }, 150);
            }
          } else {
            if (movesR.current <= 0 && skillStockR.current.length > 0) {
              setSkillOnlyMsg(true);
              setTimeout(() => setSkillOnlyMsg(false), 1500);
            } else {
              playTick();
              setSelectedCell(cell);
            }
          }
          return;
        }

        let tr = cell[0], tc = cell[1];
        if (absDx > absDy) { tc += dx > 0 ? 1 : -1; }
        else { tr += dy > 0 ? 1 : -1; }
        if (tr >= 0 && tr < ROWS && tc >= 0 && tc < COLS) {
          processSwap(cell[0], cell[1], tr, tc);
        }
      },
    })
  ).current;

  return (
    <ImageBackground
      source={require('../assets/images/bg_jungle_opt.jpg')}
      style={styles.container}
      resizeMode="cover"
    >
      {/* 連鎖フラッシュオーバーレイ（高連鎖時に画面全体を発光） */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.chainFlash,
          {
            opacity: chainFlashOpacity,
            backgroundColor: lastChain >= 6 ? '#FFD700'
              : lastChain >= 5 ? '#FF1744'
              : lastChain >= 4 ? '#FF6D00'
              : '#FFEB3B',
          },
        ]}
      />
      {/* 同時けしバッジ（連鎖バッジより上・画面25%位置） */}
      {simulMatchCount >= 2 && (() => {
        const s = simulMatchCount >= 5
          ? { bg: '#FFD54F', fontSize: 34, suffix: '!!!💫🌟', border: '#FFD700', color: '#8D6E00' }
          : simulMatchCount >= 4
          ? { bg: '#AB47BC', fontSize: 30, suffix: '!!!🌟', border: '#E1BEE7', color: '#fff' }
          : simulMatchCount >= 3
          ? { bg: '#1E88E5', fontSize: 26, suffix: '!!', border: 'transparent', color: '#fff' }
          : { bg: '#26C6DA', fontSize: 22, suffix: '!', border: 'transparent', color: '#fff' };
        return (
          <View pointerEvents="none" style={styles.simulBadgeWrapper}>
            <Animated.View
              style={[
                styles.chainBadgeCenter,
                {
                  backgroundColor: s.bg,
                  borderWidth: s.border !== 'transparent' ? 3 : 0,
                  borderColor: s.border,
                  transform: [{ scale: simulBadgeScale }],
                },
              ]}
            >
              <Text style={[styles.chainTextCenter, { fontSize: s.fontSize, color: s.color }]}>
                {simulMatchCount}同時けし{s.suffix}
              </Text>
            </Animated.View>
          </View>
        );
      })()}
      {/* 連鎖バッジ（画面中央・絶対配置） */}
      {lastChain > 1 && (() => {
        const s = lastChain >= 6
          ? { bg: '#B71C1C', fontSize: 42, suffix: '!!!💥🔥🔥', border: '#FFD700' }
          : lastChain >= 5
          ? { bg: '#D81B60', fontSize: 38, suffix: '!!!🔥🔥', border: '#FFE082' }
          : lastChain >= 4
          ? { bg: '#E53935', fontSize: 34, suffix: '!!!🔥', border: '#FFCC80' }
          : lastChain >= 3
          ? { bg: '#FF6D00', fontSize: 30, suffix: '!!', border: 'transparent' }
          : { bg: '#FFC107', fontSize: 26, suffix: '!', border: 'transparent' };
        return (
          <View pointerEvents="none" style={styles.chainBadgeWrapper}>
            <Animated.View
              style={[
                styles.chainBadgeCenter,
                {
                  backgroundColor: s.bg,
                  borderWidth: s.border !== 'transparent' ? 3 : 0,
                  borderColor: s.border,
                  transform: [{ scale: chainBadgeScale }],
                },
              ]}
            >
              <Text style={[styles.chainTextCenter, { fontSize: s.fontSize }]}>
                {lastChain}連鎖{s.suffix}
              </Text>
            </Animated.View>
          </View>
        );
      })()}
      {/* Header */}
      <View style={styles.headerBar}>
        <View style={styles.headerItem}>
          <Text style={styles.headerLabel}>SCORE</Text>
          <Text style={styles.headerValue}>{score.toLocaleString()}</Text>
        </View>
        <View style={styles.headerItemCenter}>
          <Text style={styles.levelText}>Lv.{level}</Text>
        </View>
        <View style={styles.headerItem}>
          <Text style={styles.headerLabel}>残り</Text>
          <Text style={[styles.movesValue, moves <= 3 && styles.movesWarning]}>
            {moves}<Text style={styles.movesUnit}>回</Text>
          </Text>
        </View>
      </View>

      {/* Level progress bar */}
      <View style={styles.progressContainer}>
        <View style={[styles.progressBar, { width: `${progressPct * 100}%` as any }]} />
        <Text style={styles.progressText}>
          {score} / {nextLevelScore}
        </Text>
      </View>

      {/* Badge row: icons left + badge center */}
      <View style={styles.badgeRow}>
        <View style={styles.badgeIcons}>
          <TouchableOpacity style={styles.badgeIconBtn} onPress={() => setShowSettings(true)}>
            <Text style={styles.badgeLinkText}>設定</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.badgeIconBtn} onPress={openRankingModal}>
            <Text style={styles.badgeIconText}>👑</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.badgeCenter}>
          {skillOnlyMsg ? (
            <View style={styles.skillOnlyBadge}>
              <Text style={styles.skillOnlyText}>スキルを使用してください</Text>
            </View>
          ) : levelUpMsg ? (
            <View style={styles.levelUpBadge}>
              <Text style={styles.levelUpText}>{levelUpMsg}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.badgeIcons} />
      </View>

      {/* Stock + Board area */}
      <View style={styles.gameArea}>
        {/* Skill Stock Column */}
        <View style={styles.stockWrapper}>
          <Text style={styles.stockLabel}>スキル</Text>
        <View style={[styles.stockColumn, { height: BOARD_HEIGHT - 20 }]}>
          {Array.from({ length: MAX_STOCK }).map((_, i) => {
            const stockIdx = MAX_STOCK - 1 - i; // top=6, bottom=0
            const skill = skillStock[stockIdx];
            return (
              <View key={i} style={[styles.stockCell, { width: STOCK_CELL_SIZE, height: STOCK_CELL_SIZE }]}>
                {skill && (
                  <TouchableOpacity
                    style={styles.stockCellInner}
                    onPress={() => onSkillTap(stockIdx)}
                  >
                    <Image
                      source={DINO_IMAGES[skill.type]}
                      style={{ width: STOCK_CELL_SIZE - 10, height: STOCK_CELL_SIZE - 10 }}
                      resizeMode="contain"
                    />
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>
        </View>

        {/* Board */}
        <View
          ref={boardRef}
          onLayout={onBoardLayout}
          style={[styles.board, { width: BOARD_WIDTH, height: BOARD_HEIGHT }]}
          {...panResponder.panHandlers}
          onTouchStart={(evt) => {
            if (phaseR.current === 'skill-target') {
              const { pageX, pageY } = evt.nativeEvent;
              const cell = getCellFromPosition(pageX, pageY);
              if (cell) onSkillPreviewRef.current(cell[0], cell[1]);
            }
          }}
          onTouchMove={(evt) => {
            if (phaseR.current === 'skill-target') {
              const { pageX, pageY } = evt.nativeEvent;
              const cell = getCellFromPosition(pageX, pageY);
              if (cell) onSkillPreviewRef.current(cell[0], cell[1]);
            }
          }}
        >
        {board.map((row, r) => (
          <View key={r} style={styles.row}>
            {row.map((cell, c) => {
              const key = `${r},${c}`;
              return (
                <Cell
                  key={`${r}-${c}`}
                  type={cell.type}
                  size={CELL_SIZE}
                  isSelected={selectedCell !== null && selectedCell[0] === r && selectedCell[1] === c}
                  isSwapTarget={swapTarget !== null && swapTarget[0] === r && swapTarget[1] === c}
                  isMatched={phase === 'glow' && matchedSet.has(key)}
                  isRemoving={phase === 'remove' && matchedSet.has(key)}
                  isSkillPreview={skillPreview.has(key)}
                  isExploding={explodingSet.has(key)}
                  animateIn={phase === 'settle'}
                  cellKey={cell.key}
                  rockHp={cell.hp}
                />
              );
            })}
          </View>
        ))}
        {/* パキケファロ頭突きスプライト（落下中のみ表示） */}
        {pachyAttackCol !== null && (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: pachyAttackCol * (CELL_SIZE + CELL_GAP) + CELL_GAP,
              top: CELL_GAP,
              width: CELL_SIZE,
              height: CELL_SIZE,
              transform: [{ translateY: pachyY }],
              zIndex: 10,
            }}
          >
            <Image
              source={DINO_IMAGES[5]}
              style={{ width: CELL_SIZE, height: CELL_SIZE }}
              resizeMode="contain"
            />
          </Animated.View>
        )}
      </View>
      </View>

      {/* チュートリアルTipカード（盤面下でスクロール・設定で表示ON/OFF） */}
      {settings.showTutorialTips && (
        <Animated.View
          pointerEvents="none"
          style={[styles.tipCard, { transform: [{ translateX: tipX }] }]}
        >
          <Text style={styles.tipIcon}>{TUTORIAL_TIPS[tipIdx].icon}</Text>
          <Text style={styles.tipText} numberOfLines={2}>
            {TUTORIAL_TIPS[tipIdx].text}
          </Text>
        </Animated.View>
      )}

      {/* Restart + Skill Help */}

      {/* Skill target mode banner — 2026/04/25 B-1 改修: 盤面上部に大きなバナー overlay */}
      {phase === 'skill-target' && activeSkill && (
        <View style={styles.skillBannerOverlay} pointerEvents="box-none">
          <View style={styles.skillBanner}>
            <Image
              source={DINO_IMAGES[activeSkill.type]}
              style={styles.skillBannerIcon}
              resizeMode="contain"
            />
            <View style={styles.skillBannerTextArea}>
              <Text style={styles.skillBannerTitle}>
                {DINO_NAMES[activeSkill.type]} — {
                  activeSkill.type === 1 ? '同種全消し' :
                  activeSkill.type === 3 ? '横一列 突進' :
                  activeSkill.type === 4 ? '周囲8マス 水撃' :
                  activeSkill.type === 5 ? '縦一直線 頭突き' :
                  'スキル発動中'
                }
              </Text>
              <Text style={styles.skillBannerHint}>
                {activeSkill.type === 1 ? '消したい恐竜をタップ' :
                 activeSkill.type === 3 ? '消したい行をタップ' :
                 activeSkill.type === 4 ? '中心となるマスをタップ' :
                 activeSkill.type === 5 ? '頭突きする列をタップ' :
                 'ターゲットをタップ'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.skillBannerCancelBtn}
              onPress={() => { setActiveSkill(null); setPhase('idle'); setSkillPreview(new Set()); }}
            >
              <Text style={styles.skillBannerCancelText}>キャンセル</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Skill Confirm Modal — 2026/04/25 A-1+D-3: 恐竜ごとインストール後初回のみ確認POPUP */}
      <SkillConfirmModal
        skillType={pendingSkill ? pendingSkill.type : null}
        visible={pendingSkill !== null}
        onConfirm={onConfirmSkill}
        onCancel={onCancelSkill}
      />


      {/* Skill Cutscene Overlay */}
      {skillCutscene !== null && (
        <View style={styles.overlay}>
          <Animated.View style={[styles.skillCutsceneBox, {
            transform: [{ translateX: skillSlideX }],
            opacity: skillCutsceneOpacity,
          }]}>
            <Image
              source={DINO_IMAGES[skillCutscene]}
              style={{ width: 90, height: 90 }}
              resizeMode="contain"
            />
            <View style={styles.skillCutsceneTextArea}>
              <Text style={styles.skillCutsceneName}>{DINO_NAMES[skillCutscene]}</Text>
              <Text style={styles.skillCutsceneDesc}>{SKILL_DESCRIPTIONS[skillCutscene]}</Text>
            </View>
          </Animated.View>
        </View>
      )}

      {/* How to Play Popup */}
      {showHowToPlay && (
        <View style={styles.overlay}>
          <View style={styles.skillHelpBox}>
            <Text style={styles.skillHelpTitle}>消し方説明</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              <View style={styles.howToSection}>
                <Text style={styles.howToHeading}>操作方法</Text>
                <Text style={styles.howToText}>1つ目をタップ（青枠）→ 2つ目をタップ（赤枠）で入れ替え</Text>
                <Text style={styles.howToText}>隣接していなくても入れ替え可能</Text>
                <Text style={styles.howToText}>スワイプでも隣接セルと入れ替えできます</Text>
              </View>
              <View style={styles.howToSection}>
                <Text style={styles.howToHeading}>消えるルール</Text>
                <Text style={styles.howToText}>横3つ以上（直線）→ 消える</Text>
                <Text style={styles.howToText}>縦3つ以上（直線）→ 消える</Text>
                <Text style={styles.howToText}>隣接4つ以上（L字・T字等）→ 消える</Text>
                <Text style={styles.howToText}>直線でない3つ → 消えない</Text>
              </View>
              <View style={styles.howToSection}>
                <Text style={styles.howToHeading}>手数</Text>
                <Text style={styles.howToText}>入れ替えるたびに1回消費（消えなくても消費）</Text>
                <Text style={styles.howToText}>レベルアップで手数が回復</Text>
                <Text style={styles.howToText}>スキル発動で残数+1回（スキルを積極的に使うほど得）</Text>
                <Text style={styles.howToText}>手数0でスキルが残っていれば続行可能</Text>
              </View>
              <View style={styles.howToSection}>
                <Text style={styles.howToHeading}>岩ブロック 🪨</Text>
                <Text style={styles.howToText}>Lv3,6,9,12で落下スポーン（+3個ずつ）</Text>
                <Text style={styles.howToText}>Lv15以降は毎レベル+3個（後半難化）</Text>
                <Text style={styles.howToText}>入れ替え不可・マッチしない邪魔者</Text>
                <Text style={styles.howToText}>隣接マッチ＆範囲スキルでHP-1・破壊で+30点</Text>
                <Text style={styles.howToText}>Lv1-10: ♥1 / Lv11-20: ♥2 / Lv21+: ♥3</Text>
              </View>
              <View style={styles.howToSection}>
                <Text style={styles.howToHeading}>連鎖</Text>
                <Text style={styles.howToText}>消えた後に落ちてきた恐竜で再びマッチすると連鎖</Text>
                <Text style={styles.howToText}>2連鎖で×2倍、3連鎖で×3倍のスコアボーナス</Text>
              </View>
              <View style={styles.howToSection}>
                <Text style={styles.howToHeading}>スキル</Text>
                <Text style={styles.howToText}>恐竜ごとの必要個数を同時に消すとスキルGET（5〜8個）</Text>
                <Text style={styles.howToText}>左のストック欄に恐竜が追加されます</Text>
                <Text style={styles.howToText}>タップで発動。恐竜ごとに効果が違います</Text>
              </View>
            </ScrollView>
            <View style={styles.modalButtonRow}>
              <TouchableOpacity style={styles.modalBackBtn} onPress={() => { setShowHowToPlay(false); setShowSettings(true); }}>
                <Text style={styles.modalBackBtnText}>← 設定に戻る</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowHowToPlay(false)}>
                <Text style={styles.skillHelpCloseText}>とじる</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Skill Help Popup */}
      {showSkillHelp && (
        <View style={styles.overlay}>
          <View style={styles.skillHelpBox}>
            <Text style={styles.skillHelpTitle}>スキル説明</Text>
            <Text style={styles.skillHelpSub}>必要個数は恐竜ごとに違います／発動で残数+1回</Text>
            <View style={styles.skillHelpList}>
              <View style={styles.skillHelpRow}>
                <Image source={DINO_IMAGES[0]} style={styles.skillHelpIcon} resizeMode="contain" />
                <View style={styles.skillHelpTextArea}>
                  <Text style={styles.skillHelpName}>ティラノ（8個）</Text>
                  <Text style={styles.skillHelpDesc}>草食恐竜を全消し（岩は対象外）</Text>
                </View>
              </View>
              <View style={styles.skillHelpRow}>
                <Image source={DINO_IMAGES[1]} style={styles.skillHelpIcon} resizeMode="contain" />
                <View style={styles.skillHelpTextArea}>
                  <Text style={styles.skillHelpName}>ステゴ（5個）</Text>
                  <Text style={styles.skillHelpDesc}>指定した種類を全消し（岩は対象外）</Text>
                </View>
              </View>
              <View style={styles.skillHelpRow}>
                <Image source={DINO_IMAGES[2]} style={styles.skillHelpIcon} resizeMode="contain" />
                <View style={styles.skillHelpTextArea}>
                  <Text style={styles.skillHelpName}>プテラ（6個）</Text>
                  <Text style={styles.skillHelpDesc}>ランダム10個を爆破（岩に-1ダメージ）</Text>
                </View>
              </View>
              <View style={styles.skillHelpRow}>
                <Image source={DINO_IMAGES[3]} style={styles.skillHelpIcon} resizeMode="contain" />
                <View style={styles.skillHelpTextArea}>
                  <Text style={styles.skillHelpName}>トリケラ（5個）</Text>
                  <Text style={styles.skillHelpDesc}>横一列を突進消し（岩に-1ダメージ）</Text>
                </View>
              </View>
              <View style={styles.skillHelpRow}>
                <Image source={DINO_IMAGES[4]} style={styles.skillHelpIcon} resizeMode="contain" />
                <View style={styles.skillHelpTextArea}>
                  <Text style={styles.skillHelpName}>スピノ（6個）</Text>
                  <Text style={styles.skillHelpDesc}>周囲8マスを水撃（岩に-1ダメージ）</Text>
                </View>
              </View>
              <View style={styles.skillHelpRow}>
                <Image source={DINO_IMAGES[5]} style={styles.skillHelpIcon} resizeMode="contain" />
                <View style={styles.skillHelpTextArea}>
                  <Text style={styles.skillHelpName}>パキケファロ（6個）</Text>
                  <Text style={styles.skillHelpDesc}>縦一直線+着弾で衝撃波（岩に-1ダメージ）</Text>
                </View>
              </View>
            </View>
            <View style={styles.modalButtonRow}>
              <TouchableOpacity style={styles.modalBackBtn} onPress={() => { setShowSkillHelp(false); setShowSettings(true); }}>
                <Text style={styles.modalBackBtnText}>← 設定に戻る</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowSkillHelp(false)}>
                <Text style={styles.skillHelpCloseText}>とじる</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Ranking Popup */}
      {showRanking && (
        <View style={styles.overlay}>
          <View style={styles.rankingBox}>
            <Text style={styles.rankingTitle}>
              {rankTab === 'local' ? 'マイ記録 TOP10'
                : rankTab === 'daily' ? '今日のTOP10'
                : rankTab === 'weekly' ? '今週のTOP10'
                : '今月のTOP10'}
            </Text>
            {/* タブ切り替え */}
            <View style={styles.rankTabs}>
              {(['daily', 'weekly', 'monthly', 'local'] as const).map((tab) => (
                <TouchableOpacity
                  key={tab}
                  style={[styles.rankTab, rankTab === tab && styles.rankTabActive]}
                  onPress={async () => {
                    setRankTab(tab);
                    if (tab !== 'local') {
                      setGlobalLoading(true);
                      const data = await fetchGlobalRankings(tab);
                      setGlobalRankings(data);
                      setGlobalLoading(false);
                    }
                  }}
                >
                  <Text style={[styles.rankTabText, rankTab === tab && styles.rankTabTextActive]}>
                    {tab === 'daily' ? '今日' : tab === 'weekly' ? '今週' : tab === 'monthly' ? '今月' : 'マイ記録'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.rankingHeader}>
              <Text style={[styles.rankingCell, styles.rankingRank]}>#</Text>
              <Text style={[styles.rankingCell, styles.rankingName]}>名前</Text>
              <Text style={[styles.rankingCell, styles.rankingScore]}>スコア</Text>
              <Text style={[styles.rankingCell, styles.rankingLv]}>Lv</Text>
            </View>
            <ScrollView style={{ maxHeight: 300 }}>
              {rankTab === 'local' ? (
                ranking.length === 0 ? (
                  <Text style={styles.rankingEmpty}>まだ記録がありません</Text>
                ) : ranking.map((entry, i) => (
                  <View key={i} style={[styles.rankingRow, i === 0 && styles.rankingRow1st]}>
                    <Text style={[styles.rankingCell, styles.rankingRank, i < 3 && styles.rankingTopRank]}>{i + 1}</Text>
                    <Text style={[styles.rankingCell, styles.rankingName]} numberOfLines={1}>{entry.name}</Text>
                    <Text style={[styles.rankingCell, styles.rankingScore]}>{entry.score.toLocaleString()}</Text>
                    <Text style={[styles.rankingCell, styles.rankingLv]}>{entry.level}</Text>
                  </View>
                ))
              ) : globalLoading ? (
                <Text style={styles.rankingEmpty}>読み込み中…</Text>
              ) : globalRankings.length === 0 ? (
                <Text style={styles.rankingEmpty}>
                  {rankTab === 'daily' ? '今日' : rankTab === 'weekly' ? '今週' : '今月'}の記録はまだありません
                </Text>
              ) : globalRankings.slice(0, 10).map((entry, i) => (
                <View key={i} style={[styles.rankingRow, i === 0 && styles.rankingRow1st]}>
                  <Text style={[styles.rankingCell, styles.rankingRank, i < 3 && styles.rankingTopRank]}>{i + 1}</Text>
                  <Text style={[styles.rankingCell, styles.rankingName]} numberOfLines={1}>{entry.name}</Text>
                  <Text style={[styles.rankingCell, styles.rankingScore]}>{entry.score.toLocaleString()}</Text>
                  <Text style={[styles.rankingCell, styles.rankingLv]}>{entry.level}</Text>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.skillHelpClose} onPress={() => { setShowRanking(false); setGlobalRankings([]); }}>
              <Text style={styles.skillHelpCloseText}>とじる</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Name Registration Prompt */}
      {showNamePrompt && (
        <View style={styles.overlay}>
          <View style={styles.namePromptBox}>
            <Text style={styles.namePromptTitle}>🏆 スコア登録</Text>
            <Text style={styles.namePromptScore}>{score.toLocaleString()}点 / Lv.{level}</Text>
            <Text style={styles.namePromptHint}>ランキングに名前を残そう！</Text>
            <View style={styles.nameInputRow}>
              <Text style={styles.nameLabel}>名前:</Text>
              <TextInput
                style={styles.nameInput}
                value={nameInput}
                onChangeText={setNameInput}
                maxLength={10}
                placeholder="名前を入力"
                placeholderTextColor="#666"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleNameRegister}
              />
            </View>
            {/* プライマリボタン：ランキング登録（大・目立つ） */}
            <TouchableOpacity style={styles.primaryRegBtn} onPress={handleNameRegister}>
              <Text style={styles.primaryRegBtnText}>👑 ランキング登録</Text>
            </TouchableOpacity>
            {/* セカンダリリンク：登録しない（小・地味） */}
            <TouchableOpacity style={styles.skipLinkBtn} onPress={handleNameSkip}>
              <Text style={styles.skipLinkBtnText}>登録せずに閉じる</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Settings */}
      {showSettings && (
        <View style={styles.overlay}>
          <View style={styles.settingsBox}>
            <Text style={styles.rankingTitle}>設定</Text>
            <ScrollView style={styles.settingsScroll} contentContainerStyle={styles.settingsScrollContent}>

              {/* プロフィール */}
              <Text style={styles.settingsSectionHeader}>プロフィール</Text>
              <TouchableOpacity
                style={styles.settingsActionRow}
                onPress={() => { setNameInput(playerName); setShowNameEdit(true); }}
              >
                <View style={styles.settingsActionLabelArea}>
                  <Text style={styles.settingsActionIcon}>👤</Text>
                  <View style={styles.settingsActionTextArea}>
                    <Text style={styles.settingsLabel}>プレイヤー名</Text>
                    <Text style={styles.settingsActionDesc}>{playerName ? playerName : '未登録（タップで設定）'}</Text>
                  </View>
                </View>
                <Text style={styles.settingsChevron}>›</Text>
              </TouchableOpacity>

              {/* プレイ設定 */}
              <Text style={styles.settingsSectionHeader}>プレイ設定</Text>
              <View style={styles.settingsSwitchRow}>
                <View style={styles.settingsActionLabelArea}>
                  <Text style={styles.settingsActionIcon}>🔊</Text>
                  <View style={styles.settingsActionTextArea}>
                    <Text style={styles.settingsLabel}>効果音</Text>
                    <Text style={styles.settingsActionDesc}>消去音・連鎖音・スキル音</Text>
                  </View>
                </View>
                <Switch
                  value={settings.soundEnabled}
                  onValueChange={async (val) => {
                    const newSettings = { ...settings, soundEnabled: val };
                    setSettings(newSettings);
                    await saveSettings(newSettings);
                    setSoundVolume(val ? 0.3 : 0);
                  }}
                  trackColor={{ false: '#444', true: '#FFD700' }}
                  thumbColor={settings.soundEnabled ? '#fff' : '#888'}
                />
              </View>
              <View style={styles.settingsSwitchRow}>
                <View style={styles.settingsActionLabelArea}>
                  <Text style={styles.settingsActionIcon}>🎓</Text>
                  <View style={styles.settingsActionTextArea}>
                    <Text style={styles.settingsLabel}>初心者モード</Text>
                    <Text style={styles.settingsActionDesc}>スキル発動前に毎回確認</Text>
                  </View>
                </View>
                <Switch
                  value={settings.alwaysConfirmSkill}
                  onValueChange={async (val) => {
                    const newSettings = { ...settings, alwaysConfirmSkill: val };
                    setSettings(newSettings);
                    await saveSettings(newSettings);
                  }}
                  trackColor={{ false: '#444', true: '#FFD700' }}
                  thumbColor={settings.alwaysConfirmSkill ? '#fff' : '#888'}
                />
              </View>

              {/* 表示 */}
              <Text style={styles.settingsSectionHeader}>表示</Text>
              <View style={styles.settingsSwitchRow}>
                <View style={styles.settingsActionLabelArea}>
                  <Text style={styles.settingsActionIcon}>💡</Text>
                  <View style={styles.settingsActionTextArea}>
                    <Text style={styles.settingsLabel}>チュートリアル</Text>
                    <Text style={styles.settingsActionDesc}>盤面下にTipを流す</Text>
                  </View>
                </View>
                <Switch
                  value={settings.showTutorialTips}
                  onValueChange={async (val) => {
                    const newSettings = { ...settings, showTutorialTips: val };
                    setSettings(newSettings);
                    await saveSettings(newSettings);
                  }}
                  trackColor={{ false: '#444', true: '#FFD700' }}
                  thumbColor={settings.showTutorialTips ? '#fff' : '#888'}
                />
              </View>
              <View style={styles.settingsSwitchRow}>
                <View style={styles.settingsActionLabelArea}>
                  <Text style={styles.settingsActionIcon}>🏆</Text>
                  <View style={styles.settingsActionTextArea}>
                    <Text style={styles.settingsLabel}>ランキング自動登録</Text>
                    <Text style={styles.settingsActionDesc}>登録済みなら確認なし</Text>
                  </View>
                </View>
                <Switch
                  value={settings.autoRegisterRanking}
                  onValueChange={async (val) => {
                    const newSettings = { ...settings, autoRegisterRanking: val };
                    setSettings(newSettings);
                    await saveSettings(newSettings);
                  }}
                  trackColor={{ false: '#444', true: '#FFD700' }}
                  thumbColor={settings.autoRegisterRanking ? '#fff' : '#888'}
                />
              </View>

              {/* ヘルプ */}
              <Text style={styles.settingsSectionHeader}>ヘルプ</Text>
              <TouchableOpacity
                style={styles.settingsActionRow}
                onPress={() => { setShowSettings(false); setShowHowToPlay(true); }}
              >
                <View style={styles.settingsActionLabelArea}>
                  <Text style={styles.settingsActionIcon}>📖</Text>
                  <View style={styles.settingsActionTextArea}>
                    <Text style={styles.settingsLabel}>消し方説明</Text>
                    <Text style={styles.settingsActionDesc}>ルール・操作方法</Text>
                  </View>
                </View>
                <Text style={styles.settingsChevron}>›</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.settingsActionRow}
                onPress={() => { setShowSettings(false); setShowSkillHelp(true); }}
              >
                <View style={styles.settingsActionLabelArea}>
                  <Text style={styles.settingsActionIcon}>🦕</Text>
                  <View style={styles.settingsActionTextArea}>
                    <Text style={styles.settingsLabel}>スキル説明</Text>
                    <Text style={styles.settingsActionDesc}>恐竜ごとの必要個数</Text>
                  </View>
                </View>
                <Text style={styles.settingsChevron}>›</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.settingsActionRow}
                onPress={() => { setShowSettings(false); setShowChangelog(true); }}
              >
                <View style={styles.settingsActionLabelArea}>
                  <Text style={styles.settingsActionIcon}>📋</Text>
                  <View style={styles.settingsActionTextArea}>
                    <Text style={styles.settingsLabel}>更新履歴</Text>
                    <Text style={styles.settingsActionDesc}>バージョン履歴を確認</Text>
                  </View>
                </View>
                <Text style={styles.settingsChevron}>›</Text>
              </TouchableOpacity>

              {/* 危険操作 */}
              <Text style={[styles.settingsSectionHeader, styles.settingsSectionHeaderDanger]}>危険操作</Text>
              <TouchableOpacity
                style={[styles.settingsActionRow, styles.retireRow]}
                onPress={() => { setShowSettings(false); setShowRetireConfirm(true); }}
              >
                <View style={styles.settingsActionLabelArea}>
                  <Text style={styles.settingsActionIcon}>⚠️</Text>
                  <View style={styles.settingsActionTextArea}>
                    <Text style={styles.retireLabel}>リタイヤ</Text>
                    <Text style={styles.retireDesc}>ゲームを終了して最初から</Text>
                  </View>
                </View>
                <Text style={[styles.settingsChevron, { color: '#FF5252' }]}>›</Text>
              </TouchableOpacity>

            </ScrollView>
            <TouchableOpacity style={styles.skillHelpClose} onPress={() => setShowSettings(false)}>
              <Text style={styles.skillHelpCloseText}>とじる</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Name Edit Modal（設定画面から呼出） */}
      {showNameEdit && (
        <View style={styles.overlay}>
          <View style={styles.namePromptBox}>
            <Text style={styles.namePromptTitle}>👤 プレイヤー名</Text>
            <Text style={styles.namePromptHint}>{playerName ? '名前を変更します' : '名前を登録します'}</Text>
            <View style={styles.nameInputRow}>
              <Text style={styles.nameLabel}>名前:</Text>
              <TextInput
                style={styles.nameInput}
                value={nameInput}
                onChangeText={setNameInput}
                maxLength={10}
                placeholder="名前を入力"
                placeholderTextColor="#666"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={async () => {
                  const trimmed = nameInput.trim();
                  if (trimmed.length === 0) { setShowNameEdit(false); return; }
                  setPlayerName(trimmed);
                  await savePlayerName(trimmed);
                  setShowNameEdit(false);
                }}
              />
            </View>
            <TouchableOpacity
              style={styles.primaryRegBtn}
              onPress={async () => {
                const trimmed = nameInput.trim();
                if (trimmed.length === 0) { setShowNameEdit(false); return; }
                setPlayerName(trimmed);
                await savePlayerName(trimmed);
                setShowNameEdit(false);
              }}
            >
              <Text style={styles.primaryRegBtnText}>💾 保存</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.skipLinkBtn} onPress={() => setShowNameEdit(false)}>
              <Text style={styles.skipLinkBtnText}>キャンセル</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Changelog Modal */}
      {showChangelog && (
        <View style={styles.overlay}>
          <View style={styles.settingsBox}>
            <Text style={styles.rankingTitle}>📋 更新履歴</Text>
            <ScrollView style={styles.settingsScroll} contentContainerStyle={styles.settingsScrollContent}>
              <View style={styles.changelogVersion}>
                <Text style={styles.changelogVersionTitle}>v1.2.1（2026/04/26）</Text>
                <Text style={styles.changelogItem}>・AdMob広告対応（バナー＋リワード）</Text>
                <Text style={styles.changelogItem}>・効果音ON/OFF設定追加</Text>
                <Text style={styles.changelogItem}>・プレイヤー名の変更機能追加</Text>
                <Text style={styles.changelogItem}>・設定画面のレイアウト改善</Text>
                <Text style={styles.changelogItem}>・更新履歴UIを追加</Text>
              </View>
              <View style={styles.changelogVersion}>
                <Text style={styles.changelogVersionTitle}>v1.2.0</Text>
                <Text style={styles.changelogItem}>・スキルUX改修（確認POPUP・盤面上部バナー）</Text>
                <Text style={styles.changelogItem}>・チュートリアルTips整理</Text>
                <Text style={styles.changelogItem}>・初心者モード設定追加</Text>
              </View>
              <View style={styles.changelogVersion}>
                <Text style={styles.changelogVersionTitle}>v1.1.0</Text>
                <Text style={styles.changelogItem}>・グローバルランキング実装（Firebase）</Text>
                <Text style={styles.changelogItem}>・岩ブロック追加（難易度スケーリング）</Text>
                <Text style={styles.changelogItem}>・スキル強化＋演出エスカレート</Text>
                <Text style={styles.changelogItem}>・タイトル画面追加</Text>
              </View>
              <View style={styles.changelogVersion}>
                <Text style={styles.changelogVersionTitle}>v1.0.0</Text>
                <Text style={styles.changelogItem}>・初版リリース</Text>
                <Text style={styles.changelogItem}>・5×7マッチパズル＋スキルストック</Text>
                <Text style={styles.changelogItem}>・連鎖ボーナス・レベルアップ・手数復活</Text>
              </View>
            </ScrollView>
            <View style={styles.modalButtonRow}>
              <TouchableOpacity style={styles.modalBackBtn} onPress={() => { setShowChangelog(false); setShowSettings(true); }}>
                <Text style={styles.modalBackBtnText}>← 設定に戻る</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowChangelog(false)}>
                <Text style={styles.skillHelpCloseText}>とじる</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Retire Confirm */}
      {showRetireConfirm && (
        <View style={styles.overlay}>
          <View style={styles.namePromptBox}>
            <Text style={styles.namePromptTitle}>リタイヤしますか？</Text>
            <Text style={styles.retireConfirmText}>現在のスコア: {score.toLocaleString()} / Lv.{level}</Text>
            <Text style={styles.retireConfirmSub}>スコアはランキングに登録されます</Text>
            <View style={styles.gameOverButtons}>
              <TouchableOpacity style={styles.gameOverButton} onPress={() => { setShowRetireConfirm(false); handleRestart(); }}>
                <Text style={styles.gameOverButtonText}>リタイヤする</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.gameOverButton, styles.rankingButton]} onPress={() => setShowRetireConfirm(false)}>
                <Text style={styles.gameOverButtonText}>続ける</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Game Over */}
      {gameOver && !showNamePrompt && !showRanking && (
        <View style={styles.overlay}>
          <View style={styles.gameOverBox}>
            <Text style={styles.gameOverTitle}>ゲームオーバー</Text>
            <Text style={styles.gameOverLevel}>レベル {level}</Text>
            <Text style={styles.gameOverScore}>スコア: {score.toLocaleString()}</Text>
            {score >= highScore && score > 0 && (
              <Text style={styles.newRecord}>NEW RECORD!</Text>
            )}
            <Text style={styles.highScoreText}>ハイスコア: {highScore.toLocaleString()}</Text>
            {playerName ? (
              <Text style={styles.registeredName}>登録名: {playerName}</Text>
            ) : null}
            <View style={styles.gameOverButtons}>
              <TouchableOpacity style={styles.gameOverButton} onPress={handleRestart}>
                <Text style={styles.gameOverButtonText}>もう一回</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.gameOverButton, styles.rankingButton]} onPress={openRankingModal}>
                <Text style={styles.gameOverButtonText}>👑 ランキング</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </ImageBackground>
  );
}

const TOTAL_WIDTH = STOCK_COL_WIDTH + CELL_GAP + BOARD_WIDTH;

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', paddingTop: 50 },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: TOTAL_WIDTH,
    marginBottom: 6,
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
  },
  headerItem: { alignItems: 'center', flex: 1 },
  headerItemCenter: { alignItems: 'center', flex: 1 },
  headerLabel: { color: '#aaa', fontSize: 11, fontWeight: 'bold', letterSpacing: 1 },
  headerValue: { color: '#fff', fontSize: 26, fontWeight: 'bold', textShadowColor: '#000', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 3 },
  movesValue: { color: '#fff', fontSize: 26, fontWeight: 'bold', textShadowColor: '#000', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 3 },
  movesUnit: { fontSize: 14, color: '#ccc' },
  movesWarning: { color: '#FF5252' },
  levelText: { color: '#FFD700', fontSize: 24, fontWeight: 'bold', textShadowColor: '#000', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 4 },
  gameArea: { flexDirection: 'row', alignItems: 'flex-start', gap: CELL_GAP },
  stockColumn: {
    width: STOCK_COL_WIDTH,
    backgroundColor: 'rgba(15,52,96,0.7)',
    borderRadius: 12,
    padding: 4,
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 3,
  },
  stockCell: {
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'rgba(255,215,0,0.5)',
    backgroundColor: 'rgba(26,26,46,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stockCellInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressContainer: {
    width: TOTAL_WIDTH,
    height: 22,
    backgroundColor: 'rgba(15,52,96,0.8)',
    borderRadius: 11,
    marginBottom: 6,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  progressBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#FFD700',
    borderRadius: 11,
  },
  progressText: {
    color: '#fff',
    fontSize: 12,
    textAlign: 'center',
    fontWeight: 'bold',
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  rankTabs: { flexDirection: 'row', gap: 4, marginBottom: 8, justifyContent: 'center' },
  rankTab: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  rankTabActive: { backgroundColor: 'rgba(255,215,0,0.25)', borderColor: '#FFD700' },
  rankTabText: { color: '#ccc', fontSize: 12, fontWeight: '600' },
  rankTabTextActive: { color: '#FFD700', fontWeight: 'bold' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', width: TOTAL_WIDTH, height: 46, marginBottom: 4 },
  badgeIcons: { flexDirection: 'row', alignItems: 'center', gap: 8, width: 120 },
  badgeIconBtn: { backgroundColor: 'rgba(15,52,96,0.85)', width: 56, height: 42, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', alignItems: 'center' as const, justifyContent: 'center' as const },
  badgeIconText: { fontSize: 22, textAlign: 'center' as const },
  badgeLinkText: { color: '#fff', fontSize: 14, fontWeight: 'bold', textAlign: 'center' as const },
  badgeCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  skillOnlyBadge: { backgroundColor: '#FF5252', paddingHorizontal: 16, paddingVertical: 4, borderRadius: 12 },
  skillOnlyText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  chainBadge: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 3, elevation: 4 },
  chainText: { color: '#fff', fontWeight: 'bold', textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2 },
  chainFlash: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 },
  chainBadgeWrapper: { position: 'absolute', top: '40%', left: 0, right: 0, alignItems: 'center', zIndex: 100 },
  simulBadgeWrapper: { position: 'absolute', top: '25%', left: 0, right: 0, alignItems: 'center', zIndex: 101 },
  tipCard: {
    // 盤面の真下に配置（gameArea 直後の flex 子）
    marginTop: 10,
    width: TOTAL_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(15,52,96,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.45)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
    overflow: 'hidden',
  },
  tipIcon: { fontSize: 22 },
  tipText: { color: '#fff', fontSize: 13, flex: 1, lineHeight: 17 },
  chainBadgeCenter: { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 22, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 6, elevation: 10 },
  chainTextCenter: { color: '#fff', fontWeight: 'bold', textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.7)', textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 4 },
  levelUpBadge: { backgroundColor: '#FFD700', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 12 },
  levelUpText: { color: '#1a1a2e', fontSize: 16, fontWeight: 'bold' },
  board: { backgroundColor: 'rgba(22,33,62,0.85)', borderRadius: 12, padding: CELL_GAP, flexDirection: 'column' },
  row: { flexDirection: 'row', gap: CELL_GAP, marginBottom: CELL_GAP },
  stockWrapper: { alignItems: 'center' },
  stockLabel: { color: '#FFD700', fontSize: 11, fontWeight: 'bold', marginBottom: 4, textShadowColor: '#000', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', zIndex: 200, elevation: 20 },
  gameOverBox: { backgroundColor: '#1a1a2e', borderRadius: 16, padding: 32, alignItems: 'center', borderWidth: 2, borderColor: '#e94560' },
  gameOverTitle: { color: '#e94560', fontSize: 28, fontWeight: 'bold', marginBottom: 8 },
  gameOverLevel: { color: '#FFD700', fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  gameOverScore: { color: '#fff', fontSize: 22, marginBottom: 24 },
  gameOverButton: { backgroundColor: '#e94560', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 8 },
  gameOverButtons: { flexDirection: 'row', gap: 12 },
  gameOverButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  rankingButton: { backgroundColor: '#0f3460' },
  newRecord: { color: '#FFD700', fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  highScoreText: { color: '#aaa', fontSize: 14, marginBottom: 12 },
  nameInputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 8 },
  nameLabel: { color: '#aaa', fontSize: 14 },
  nameInput: { backgroundColor: '#2a2a4e', color: '#fff', fontSize: 16, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#555', width: 140 },
  rankingBox: { backgroundColor: '#1a1a3e', borderRadius: 16, padding: 24, borderWidth: 2, borderColor: '#FFD700', width: TOTAL_WIDTH - 16, maxWidth: 340 },
  rankingTitle: { color: '#FFD700', fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 12 },
  rankingHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#444', paddingBottom: 6, marginBottom: 6 },
  rankingRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  rankingRow1st: { backgroundColor: 'rgba(255,215,0,0.1)' },
  rankingCell: { color: '#ddd', fontSize: 13 },
  rankingRank: { width: 28, textAlign: 'center', fontWeight: 'bold' },
  rankingTopRank: { color: '#FFD700' },
  rankingName: { flex: 1 },
  rankingScore: { width: 70, textAlign: 'right', fontWeight: 'bold' },
  rankingLv: { width: 32, textAlign: 'right' },
  rankingDate: { width: 52, textAlign: 'right', fontSize: 10, color: '#999' },
  rankingEmpty: { color: '#666', textAlign: 'center', paddingVertical: 20 },
  namePromptBox: { backgroundColor: '#1a1a3e', borderRadius: 16, padding: 24, borderWidth: 2, borderColor: '#FFD700', width: TOTAL_WIDTH - 16, maxWidth: 340, alignItems: 'center' },
  namePromptTitle: { color: '#FFD700', fontSize: 22, fontWeight: 'bold', marginBottom: 8 },
  namePromptScore: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  namePromptHint: { color: '#ccc', fontSize: 13, marginBottom: 14 },
  primaryRegBtn: { backgroundColor: '#e94560', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 10, borderWidth: 2, borderColor: '#FFD700', alignSelf: 'stretch', alignItems: 'center', marginTop: 4, marginBottom: 10, shadowColor: '#FFD700', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 },
  primaryRegBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold', textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2 },
  skipLinkBtn: { paddingHorizontal: 12, paddingVertical: 8, marginTop: 2 },
  skipLinkBtnText: { color: '#888', fontSize: 12, textDecorationLine: 'underline' },
  registeredName: { color: '#aaa', fontSize: 13, marginBottom: 12 },
  settingsBox: { backgroundColor: '#1a1a3e', borderRadius: 16, padding: 24, borderWidth: 2, borderColor: '#FFD700', width: TOTAL_WIDTH - 16, maxWidth: 340, maxHeight: '85%' },
  settingsScroll: { width: '100%', marginVertical: 8 },
  settingsScrollContent: { paddingBottom: 8 },
  settingsSectionHeader: { color: '#FFD700', fontSize: 12, fontWeight: 'bold', letterSpacing: 1, marginTop: 14, marginBottom: 8, paddingLeft: 4, borderLeftWidth: 3, borderLeftColor: '#FFD700' },
  settingsSectionHeaderDanger: { color: '#FF5252', borderLeftColor: '#FF5252' },
  settingsActionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(15,52,96,0.6)', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 8 },
  settingsSwitchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(15,52,96,0.6)', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 8 },
  settingsActionLabelArea: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  settingsActionIcon: { fontSize: 22 },
  settingsActionTextArea: { flex: 1 },
  settingsLabel: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  settingsActionDesc: { color: '#aaa', fontSize: 11, marginTop: 2 },
  settingsChevron: { color: '#FFD700', fontSize: 20, fontWeight: 'bold', marginLeft: 8 },
  settingsRow: { backgroundColor: 'rgba(15,52,96,0.6)', borderRadius: 8, padding: 12, marginBottom: 12 },
  settingsValue: { color: '#FFD700', fontSize: 12, marginTop: 4 },
  changelogVersion: { backgroundColor: 'rgba(15,52,96,0.6)', borderRadius: 8, padding: 12, marginBottom: 10 },
  changelogVersionTitle: { color: '#FFD700', fontSize: 14, fontWeight: 'bold', marginBottom: 6 },
  changelogItem: { color: '#ddd', fontSize: 12, lineHeight: 20 },
  howToSection: { marginBottom: 14 },
  howToHeading: { color: '#FFD700', fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
  howToText: { color: '#ddd', fontSize: 12, lineHeight: 20, paddingLeft: 8 },
  retireRow: { borderWidth: 1, borderColor: 'rgba(255,82,82,0.3)' },
  retireLabel: { color: '#FF5252', fontSize: 14, fontWeight: 'bold' },
  retireDesc: { color: '#aaa', fontSize: 11, marginTop: 4 },
  retireConfirmText: { color: '#fff', fontSize: 16, marginBottom: 4 },
  retireConfirmSub: { color: '#aaa', fontSize: 12, marginBottom: 16 },
  skillHint: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 },
  skillHintText: { color: '#FFD700', fontSize: 14, fontWeight: 'bold' },
  skillCancelText: { color: '#FF5252', fontSize: 14, fontWeight: 'bold' },
  // 2026/04/25 B-1 改修: スキルターゲット選択時の盤面上部バナー
  skillBannerOverlay: {
    position: 'absolute',
    top: 70,
    left: 8,
    right: 8,
    alignItems: 'center',
    zIndex: 180,
    elevation: 18,
  },
  skillBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(26,26,46,0.95)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 2,
    borderColor: '#FFD700',
    width: '100%',
    gap: 10,
  },
  skillBannerIcon: {
    width: 48,
    height: 48,
  },
  skillBannerTextArea: {
    flex: 1,
  },
  skillBannerTitle: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  skillBannerHint: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  skillBannerCancelBtn: {
    backgroundColor: 'rgba(255,82,82,0.2)',
    borderWidth: 1,
    borderColor: '#FF5252',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  skillBannerCancelText: {
    color: '#FF5252',
    fontSize: 13,
    fontWeight: 'bold',
  },
  skillCutsceneBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(26,26,46,0.95)',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderWidth: 3,
    borderColor: '#FFD700',
    gap: 16,
  },
  skillCutsceneTextArea: {
    alignItems: 'flex-start',
  },
  skillCutsceneName: {
    color: '#FFD700',
    fontSize: 22,
    fontWeight: 'bold',
  },
  skillCutsceneDesc: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 4,
  },
  skillHelpBox: {
    backgroundColor: '#1a1a3e',
    borderRadius: 16,
    padding: 24,
    borderWidth: 2,
    borderColor: '#FFD700',
    width: TOTAL_WIDTH - 16,
    maxWidth: 340,
  },
  skillHelpTitle: { color: '#FFD700', fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 4 },
  skillHelpSub: { color: '#ccc', fontSize: 12, textAlign: 'center', marginBottom: 16 },
  skillHelpList: { gap: 12 },
  skillHelpRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(15,52,96,0.6)', borderRadius: 8, padding: 8 },
  skillHelpIcon: { width: 36, height: 36 },
  skillHelpTextArea: { flex: 1 },
  skillHelpName: { color: '#FFD700', fontSize: 14, fontWeight: 'bold' },
  skillHelpDesc: { color: '#eee', fontSize: 12 },
  skillHelpClose: { marginTop: 16, backgroundColor: '#0f3460', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  skillHelpCloseText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  modalButtonRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalBackBtn: { flex: 1, backgroundColor: '#FFD700', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  modalBackBtnText: { color: '#000', fontSize: 14, fontWeight: 'bold' },
  modalCloseBtn: { flex: 1, backgroundColor: '#0f3460', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
});
