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
  SKILL_TRIGGER_COUNT,
  DINO_NAMES,
  HERBIVORES,
  SkillStock,
  createSkillStock,
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
  GameSettings,
  RankingEntry,
} from './storage';
import Cell from './Cell';
import { DINO_IMAGES } from './dinoImages';
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
} from './sound';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
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
  const [settings, setSettings] = useState<GameSettings>({ autoRegisterRanking: true });
  const [pendingGameOver, setPendingGameOver] = useState(false);
  const [skillCutscene, setSkillCutscene] = useState<number | null>(null);
  const skillSlideX = useRef(new Animated.Value(-300)).current;
  const skillCutsceneOpacity = useRef(new Animated.Value(0)).current;

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
      // 名前登録済み + 自動登録ON → 即ランキング登録
      const { ranking: newRanking } = await addRankingEntry({
        name: currentName,
        score: scoreR.current,
        level: levelR.current,
        date: new Date().toLocaleDateString('ja-JP'),
      });
      setRanking(newRanking);
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

  const checkLevelUp = useCallback((newScore: number, currentMoves: number) => {
    const oldLevel = levelR.current;
    const newLevel = getLevel(newScore);
    if (newLevel > oldLevel) {
      const bonus = getLevelUpBonus(newLevel);
      playLevelUp();
      setLevel(newLevel);
      setMoves(currentMoves + bonus);
      setLevelUpMsg(`Lv.${newLevel}! +${bonus}回`);
      setTimeout(() => setLevelUpMsg(null), 1500);
      return bonus;
    }
    return 0;
  }, []);

  const runNextStep = useCallback((currentBoard: DinoCell[][], chainCount: number, accScore: number, currentMoves: number) => {
    const matches = findMatches(currentBoard);
    if (matches.length === 0) {
      setPhase('idle');
      setMatchedSet(new Set());
      setLastChain(chainCount);
      if (currentMoves <= 0 && skillStockR.current.length === 0) {
        triggerGameOverRef.current();
      }
      return;
    }

    const newChain = chainCount + 1;
    const matched = new Set<string>();
    for (const m of matches) {
      for (const [r, c] of m.cells) matched.add(`${r},${c}`);
    }

    setMatchedSet(matched);
    setPhase('glow');
    if (newChain >= 2) playBonus();
    playErase();

    setTimeout(() => {
      const scoreGain = calculateScore(matches, newChain);
      const newScore = accScore + scoreGain;
      setScore(newScore);

      // 5個以上マッチでスキル獲得
      const newSkills: SkillStock[] = [];
      for (const m of matches) {
        if (m.cells.length >= SKILL_TRIGGER_COUNT) {
          const [mr, mc] = m.cells[0];
          const dinoType = currentBoard[mr][mc].type;
          newSkills.push(createSkillStock(dinoType));
        }
      }
      if (newSkills.length > 0) {
        setSkillStock(prev => {
          const updated = [...prev, ...newSkills];
          // 上限7個。溢れたら古いものから消す
          return updated.length > MAX_STOCK ? updated.slice(updated.length - MAX_STOCK) : updated;
        });
      }

      const bonus = checkLevelUp(newScore, currentMoves);
      const updatedMoves = currentMoves + bonus;

      setPhase('remove');

      setTimeout(() => {
        const { board: filled } = removeAndFill(currentBoard, matches);
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

    if (toRemove.size === 0) return;

    const isExplosion = skillType === 2; // プテラは爆発演出

    if (isExplosion) {
      // 爆発演出: 時間差でバン！バン！と消える
      playBomb();
      setExplodingSet(toRemove);
      setPhase('glow');

      setTimeout(() => {
        const scoreGain = toRemove.size * 10;
        setScore(prev => prev + scoreGain);

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
        const scoreGain = toRemove.size * 10;
        setScore(prev => prev + scoreGain);

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

  // ストックタップ → スキル種類に応じて即発動 or ターゲット選択モードへ
  const onSkillTap = useCallback((stockIndex: number) => {
    if (phaseR.current !== 'idle' || gameOverR.current) return;
    const skill = skillStock[stockIndex];
    if (!skill) return;

    const needsTarget = [1, 3, 4, 5].includes(skill.type); // ステゴ, トリケラ, スピノ, パキケファロ
    if (needsTarget) {
      setActiveSkill({ type: skill.type, index: stockIndex });
      setPhase('skill-target');
      setSelectedCell(null);
    } else {
      // ティラノ, プテラ → 即発動
      playSkillCutscene(skill.type, stockIndex);
    }
  }, [skillStock, playSkillCutscene]);

  // スキルの影響範囲を計算してプレビュー表示
  const calcSkillPreview = useCallback((skillType: number, r: number, c: number): Set<string> => {
    const preview = new Set<string>();
    const cur = boardR.current;
    switch (skillType) {
      case 1: // ステゴ: 同種全消し
        {
          const targetType = cur[r][c].type;
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
          <TouchableOpacity style={styles.badgeIconBtn} onPress={() => { loadRanking().then(setRanking); setShowRanking(true); }}>
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
          ) : lastChain > 1 ? (
            <View style={styles.chainBadge}>
              <Text style={styles.chainText}>{lastChain}連鎖!</Text>
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
                />
              );
            })}
          </View>
        ))}
      </View>
      </View>

      {/* Restart + Skill Help */}

      {/* Skill target mode hint */}
      {phase === 'skill-target' && activeSkill && (
        <View style={styles.skillHint}>
          <Text style={styles.skillHintText}>
            {activeSkill.type === 1 ? '消したい恐竜をタップ' :
             activeSkill.type === 3 ? '消したい行をタップ' :
             activeSkill.type === 5 ? '頭突きする列をタップ' :
             'ターゲットをタップ'}
          </Text>
          <TouchableOpacity onPress={() => { setActiveSkill(null); setPhase('idle'); }}>
            <Text style={styles.skillCancelText}>キャンセル</Text>
          </TouchableOpacity>
        </View>
      )}

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
                <Text style={styles.howToText}>手数0でスキルが残っていれば続行可能</Text>
              </View>
              <View style={styles.howToSection}>
                <Text style={styles.howToHeading}>連鎖</Text>
                <Text style={styles.howToText}>消えた後に落ちてきた恐竜で再びマッチすると連鎖</Text>
                <Text style={styles.howToText}>2連鎖で×2倍、3連鎖で×3倍のスコアボーナス</Text>
              </View>
              <View style={styles.howToSection}>
                <Text style={styles.howToHeading}>スキル</Text>
                <Text style={styles.howToText}>6個以上同時に消すとスキルGET</Text>
                <Text style={styles.howToText}>左のストック欄に恐竜が追加されます</Text>
                <Text style={styles.howToText}>タップで発動。恐竜ごとに効果が違います</Text>
              </View>
            </ScrollView>
            <TouchableOpacity style={styles.skillHelpClose} onPress={() => setShowHowToPlay(false)}>
              <Text style={styles.skillHelpCloseText}>とじる</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Skill Help Popup */}
      {showSkillHelp && (
        <View style={styles.overlay}>
          <View style={styles.skillHelpBox}>
            <Text style={styles.skillHelpTitle}>スキル説明</Text>
            <Text style={styles.skillHelpSub}>6個以上揃えるとスキルGET!</Text>
            <View style={styles.skillHelpList}>
              <View style={styles.skillHelpRow}>
                <Image source={DINO_IMAGES[0]} style={styles.skillHelpIcon} resizeMode="contain" />
                <View style={styles.skillHelpTextArea}>
                  <Text style={styles.skillHelpName}>ティラノ</Text>
                  <Text style={styles.skillHelpDesc}>草食恐竜を全消し</Text>
                </View>
              </View>
              <View style={styles.skillHelpRow}>
                <Image source={DINO_IMAGES[1]} style={styles.skillHelpIcon} resizeMode="contain" />
                <View style={styles.skillHelpTextArea}>
                  <Text style={styles.skillHelpName}>ステゴ</Text>
                  <Text style={styles.skillHelpDesc}>指定した種類を全消し</Text>
                </View>
              </View>
              <View style={styles.skillHelpRow}>
                <Image source={DINO_IMAGES[2]} style={styles.skillHelpIcon} resizeMode="contain" />
                <View style={styles.skillHelpTextArea}>
                  <Text style={styles.skillHelpName}>プテラ</Text>
                  <Text style={styles.skillHelpDesc}>ランダム10個を爆破</Text>
                </View>
              </View>
              <View style={styles.skillHelpRow}>
                <Image source={DINO_IMAGES[3]} style={styles.skillHelpIcon} resizeMode="contain" />
                <View style={styles.skillHelpTextArea}>
                  <Text style={styles.skillHelpName}>トリケラ</Text>
                  <Text style={styles.skillHelpDesc}>横一列を突進消し</Text>
                </View>
              </View>
              <View style={styles.skillHelpRow}>
                <Image source={DINO_IMAGES[4]} style={styles.skillHelpIcon} resizeMode="contain" />
                <View style={styles.skillHelpTextArea}>
                  <Text style={styles.skillHelpName}>スピノ</Text>
                  <Text style={styles.skillHelpDesc}>周囲8マスを水撃</Text>
                </View>
              </View>
              <View style={styles.skillHelpRow}>
                <Image source={DINO_IMAGES[5]} style={styles.skillHelpIcon} resizeMode="contain" />
                <View style={styles.skillHelpTextArea}>
                  <Text style={styles.skillHelpName}>パキケファロ</Text>
                  <Text style={styles.skillHelpDesc}>縦一直線+着弾で衝撃波</Text>
                </View>
              </View>
            </View>
            <TouchableOpacity style={styles.skillHelpClose} onPress={() => setShowSkillHelp(false)}>
              <Text style={styles.skillHelpCloseText}>とじる</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Ranking Popup */}
      {showRanking && (
        <View style={styles.overlay}>
          <View style={styles.rankingBox}>
            <Text style={styles.rankingTitle}>ランキング TOP10</Text>
            <View style={styles.rankingHeader}>
              <Text style={[styles.rankingCell, styles.rankingRank]}>#</Text>
              <Text style={[styles.rankingCell, styles.rankingName]}>名前</Text>
              <Text style={[styles.rankingCell, styles.rankingScore]}>スコア</Text>
              <Text style={[styles.rankingCell, styles.rankingLv]}>Lv</Text>
            </View>
            <ScrollView style={{ maxHeight: 300 }}>
              {ranking.length === 0 ? (
                <Text style={styles.rankingEmpty}>まだ記録がありません</Text>
              ) : ranking.map((entry, i) => (
                <View key={i} style={[styles.rankingRow, i === 0 && styles.rankingRow1st]}>
                  <Text style={[styles.rankingCell, styles.rankingRank, i < 3 && styles.rankingTopRank]}>
                    {i + 1}
                  </Text>
                  <Text style={[styles.rankingCell, styles.rankingName]} numberOfLines={1}>{entry.name}</Text>
                  <Text style={[styles.rankingCell, styles.rankingScore]}>{entry.score.toLocaleString()}</Text>
                  <Text style={[styles.rankingCell, styles.rankingLv]}>{entry.level}</Text>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.skillHelpClose} onPress={() => setShowRanking(false)}>
              <Text style={styles.skillHelpCloseText}>とじる</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Name Registration Prompt */}
      {showNamePrompt && (
        <View style={styles.overlay}>
          <View style={styles.namePromptBox}>
            <Text style={styles.namePromptTitle}>スコア登録</Text>
            <Text style={styles.namePromptScore}>{score.toLocaleString()}点 / Lv.{level}</Text>
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
              />
            </View>
            <View style={styles.gameOverButtons}>
              <TouchableOpacity style={styles.gameOverButton} onPress={handleNameRegister}>
                <Text style={styles.gameOverButtonText}>登録する</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.gameOverButton, styles.rankingButton]} onPress={handleNameSkip}>
                <Text style={styles.gameOverButtonText}>登録しない</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Settings */}
      {showSettings && (
        <View style={styles.overlay}>
          <View style={styles.settingsBox}>
            <Text style={styles.rankingTitle}>設定</Text>
            <TouchableOpacity
              style={styles.settingsRow}
              onPress={async () => {
                const newSettings = { ...settings, autoRegisterRanking: !settings.autoRegisterRanking };
                setSettings(newSettings);
                await saveSettings(newSettings);
              }}
            >
              <Text style={styles.settingsLabel}>ランキング自動登録</Text>
              <Text style={styles.settingsValue}>{settings.autoRegisterRanking ? 'ON（名前登録済みなら確認なし）' : 'OFF（毎回確認）'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.settingsRow}
              onPress={() => { setShowSettings(false); setShowHowToPlay(true); }}
            >
              <Text style={styles.settingsLabel}>消し方説明</Text>
              <Text style={styles.settingsValue}>ルール・操作方法を確認</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.settingsRow}
              onPress={() => { setShowSettings(false); setShowSkillHelp(true); }}
            >
              <Text style={styles.settingsLabel}>スキル説明</Text>
              <Text style={styles.settingsValue}>6個以上揃えでスキルGET</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.settingsRow, styles.retireRow]}
              onPress={() => { setShowSettings(false); setShowRetireConfirm(true); }}
            >
              <Text style={styles.retireLabel}>リタイヤ</Text>
              <Text style={styles.retireDesc}>現在のゲームを終了して最初からやり直す</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.skillHelpClose} onPress={() => setShowSettings(false)}>
              <Text style={styles.skillHelpCloseText}>とじる</Text>
            </TouchableOpacity>
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
              <TouchableOpacity style={[styles.gameOverButton, styles.rankingButton]} onPress={() => { loadRanking().then(setRanking); setShowRanking(true); }}>
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
  badgeRow: { flexDirection: 'row', alignItems: 'center', width: TOTAL_WIDTH, height: 32, marginBottom: 4 },
  badgeIcons: { flexDirection: 'row', alignItems: 'center', gap: 6, width: 80 },
  badgeIconBtn: { backgroundColor: 'rgba(15,52,96,0.8)', width: 50, height: 28, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center' as const, justifyContent: 'center' as const },
  badgeIconText: { fontSize: 14, textAlign: 'center' as const },
  badgeLinkText: { color: '#fff', fontSize: 11, fontWeight: 'bold', textAlign: 'center' as const },
  badgeCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  skillOnlyBadge: { backgroundColor: '#FF5252', paddingHorizontal: 16, paddingVertical: 4, borderRadius: 12 },
  skillOnlyText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  chainBadge: { backgroundColor: '#FF6D00', paddingHorizontal: 12, paddingVertical: 3, borderRadius: 12 },
  chainText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  levelUpBadge: { backgroundColor: '#FFD700', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 12 },
  levelUpText: { color: '#1a1a2e', fontSize: 16, fontWeight: 'bold' },
  board: { backgroundColor: 'rgba(22,33,62,0.85)', borderRadius: 12, padding: CELL_GAP, flexDirection: 'column' },
  row: { flexDirection: 'row', gap: CELL_GAP, marginBottom: CELL_GAP },
  stockWrapper: { alignItems: 'center' },
  stockLabel: { color: '#FFD700', fontSize: 11, fontWeight: 'bold', marginBottom: 4, textShadowColor: '#000', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
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
  rankingEmpty: { color: '#666', textAlign: 'center', paddingVertical: 20 },
  namePromptBox: { backgroundColor: '#1a1a3e', borderRadius: 16, padding: 24, borderWidth: 2, borderColor: '#FFD700', width: TOTAL_WIDTH - 16, maxWidth: 340, alignItems: 'center' },
  namePromptTitle: { color: '#FFD700', fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  namePromptScore: { color: '#fff', fontSize: 18, marginBottom: 16 },
  registeredName: { color: '#aaa', fontSize: 13, marginBottom: 12 },
  settingsBox: { backgroundColor: '#1a1a3e', borderRadius: 16, padding: 24, borderWidth: 2, borderColor: '#FFD700', width: TOTAL_WIDTH - 16, maxWidth: 340 },
  settingsRow: { backgroundColor: 'rgba(15,52,96,0.6)', borderRadius: 8, padding: 12, marginBottom: 12 },
  settingsLabel: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  settingsValue: { color: '#FFD700', fontSize: 12, marginTop: 4 },
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
});
