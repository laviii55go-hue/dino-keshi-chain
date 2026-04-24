// 恐竜けし連鎖 — ゲームロジック

export const COLS = 5;
export const ROWS = 7;
export const DINO_TYPES = 6;
export const INITIAL_MOVES = 8;

// レベルテーブル: [必要累計スコア, 復活回数]
export const LEVEL_TABLE: [number, number][] = [
  [150, 2],    // Lv1→2
  [400, 2],    // Lv2→3
  [750, 2],    // Lv3→4
  [1200, 2],   // Lv4→5
  [1800, 2],   // Lv5→6
  [2500, 3],   // Lv6→7
  [3300, 3],   // Lv7→8
  [4200, 3],   // Lv8→9
  [5200, 3],   // Lv9→10
  [6400, 3],   // Lv10→11
];

// 現在のレベルを算出（1始まり）
export function getLevel(totalScore: number): number {
  let level = 1;
  for (const [threshold] of LEVEL_TABLE) {
    if (totalScore >= threshold) level++;
    else break;
  }
  // Lv11以降: 6400 + 1500刻み
  if (level > LEVEL_TABLE.length) {
    const beyond = totalScore - LEVEL_TABLE[LEVEL_TABLE.length - 1][0];
    level = LEVEL_TABLE.length + 1 + Math.floor(beyond / 1500);
  }
  return level;
}

// 次のレベルまでの必要スコアを返す
export function getNextLevelScore(currentLevel: number): number {
  const idx = currentLevel - 1; // Lv1→index 0
  if (idx < LEVEL_TABLE.length) {
    return LEVEL_TABLE[idx][0];
  }
  // Lv11以降: 6400 + (level - 10) * 1500
  return 6400 + (currentLevel - 10) * 1500;
}

// レベルアップ時の復活回数を返す
export function getLevelUpBonus(newLevel: number): number {
  const idx = newLevel - 2; // Lv2のボーナス = index 0
  if (idx >= 0 && idx < LEVEL_TABLE.length) {
    return LEVEL_TABLE[idx][1];
  }
  // Lv11以降
  return 3;
}

export interface DinoCell {
  type: number; // 0-5 (通常恐竜) / -1 (岩ブロック)
  key: string;  // unique key for animation
  hp?: number;  // 岩ブロック時のみ使用（残り耐久）
}

export const DINO_COLORS = ['#E53935', '#1E88E5', '#43A047', '#FDD835', '#8E24AA', '#FB8C00'];
export const DINO_NAMES = ['ティラノ', 'ステゴ', 'プテラ', 'トリケラ', 'スピノ', 'パキケファロ'];
export const DINO_EMOJI = ['🔴', '🔵', '🟢', '🟡', '🟣', '🟠'];

// 岩ブロック（難易度スケーリング・Lv5/10/15/20... で出現）
export const ROCK_TYPE = -1;
export const ROCK_DESTROY_SCORE = 30;
export const ROCK_SPAWN_COUNT_PER_MILESTONE = 3;

// レベルに応じた新規スポーン岩のHP
export function getRockHpByLevel(level: number): number {
  if (level <= 10) return 1;
  if (level <= 20) return 2;
  return 3;
}

// 岩スポーン条件
// - 序盤〜中盤（Lv3-14）: 3レベルごと（Lv3,6,9,12）
// - 後半（Lv15以降）: 毎レベル（Lv15,16,17,18...）
// レベルアップの要求スコアが大きくなる後半で、プレイの緊張感を維持するため毎Lv化
export function shouldSpawnRocks(newLevel: number): boolean {
  if (newLevel < 3) return false;
  if (newLevel >= 15) return true;
  return newLevel % 3 === 0;
}

// スキルが岩を破壊できるか
// 草食全消し(0)・種類指定(1) は岩対象外、範囲攻撃系(2-5) は破壊可能
export function skillBreaksRock(skillType: number): boolean {
  return [2, 3, 4, 5].includes(skillType);
}

// スキルストック
export const MAX_STOCK = 9;
export const SKILL_TRIGGER_COUNT = 6; // 旧グローバル値（後方互換用・新ロジックは下記を使用）

// スキル獲得に必要な最小マッチ個数（スキル種別ごと・2026/04/24 案B）
export const SKILL_TRIGGER_COUNTS: Record<number, number> = {
  0: 8, // ティラノ（最強・草食全消し）
  1: 5, // ステゴ（中弱・種類全消し）
  2: 6, // プテラ（中・ランダム10）
  3: 5, // トリケラ（弱・横一列）
  4: 6, // スピノ（中・周囲8マス）
  5: 6, // パキケファロ（中〜強・縦一直線+着弾周囲）
};

export function getSkillTriggerCount(type: number): number {
  return SKILL_TRIGGER_COUNTS[type] ?? SKILL_TRIGGER_COUNT;
}

export interface SkillStock {
  type: number; // 恐竜タイプ (0-5)
  key: string;  // unique key for animation
}

let skillKeyCounter = 0;
export function createSkillStock(type: number): SkillStock {
  return { type, key: `sk${skillKeyCounter++}` };
}

// マッチ結果からスキル獲得をチェック（5個以上のマッチ）
export function checkSkillGain(matches: Match[]): number[] {
  const gained: number[] = [];
  for (const match of matches) {
    if (match.cells.length >= SKILL_TRIGGER_COUNT) {
      // マッチの恐竜タイプを取得（最初のセルのタイプ）
      gained.push(-1); // placeholder — Board側で実際のtypeを設定
    }
  }
  return gained;
}

// 草食恐竜: ステゴ(1), トリケラ(3), パキケファロ(5)
export const HERBIVORES = [1, 3, 5];
// 肉食恐竜: ティラノ(0), スピノ(4)
export const CARNIVORES = [0, 4];
// 飛行: プテラ(2)
export const FLYERS = [2];

// DINO_IMAGES is in dinoImages.ts (separated to avoid Node.js require issues in tests)

let keyCounter = 0;
function nextKey(): string {
  return `d${keyCounter++}`;
}

export function createRandomType(): number {
  return Math.floor(Math.random() * DINO_TYPES);
}

export function createCell(type?: number): DinoCell {
  return { type: type ?? createRandomType(), key: nextKey() };
}

// 岩セルを生成
export function createRockCell(hp: number): DinoCell {
  return { type: ROCK_TYPE, key: nextKey(), hp };
}

// 盤面にランダムに岩を配置（既存の岩は避ける）
export function spawnRocks(board: DinoCell[][], count: number, hp: number): DinoCell[][] {
  const newBoard = cloneBoard(board);
  const candidates: [number, number][] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (newBoard[r][c].type !== ROCK_TYPE) candidates.push([r, c]);
    }
  }
  // シャッフル
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const placeCount = Math.min(count, candidates.length);
  for (let i = 0; i < placeCount; i++) {
    const [r, c] = candidates[i];
    newBoard[r][c] = createRockCell(hp);
  }
  return newBoard;
}

// 初期盤面を生成（マッチが一切ない状態を保証）
export function createBoard(): DinoCell[][] {
  for (let attempt = 0; attempt < 100; attempt++) {
    const board: DinoCell[][] = [];
    for (let r = 0; r < ROWS; r++) {
      const row: DinoCell[] = [];
      for (let c = 0; c < COLS; c++) {
        let cell: DinoCell;
        let tries = 0;
        do {
          cell = createCell();
          tries++;
        } while (tries < 50 && wouldMatch(board, row, r, c, cell.type));
        row.push(cell);
      }
      board.push(row);
    }
    // 最終チェック: findMatchesで本当にマッチがないか確認
    if (findMatches(board).length === 0) {
      return board;
    }
  }
  // フォールバック（到達しないはず）
  return createBoard();
}

function wouldMatch(
  board: DinoCell[][],
  currentRow: DinoCell[],
  r: number,
  c: number,
  type: number
): boolean {
  // 岩セルは通常セルのマッチ生成に影響しない（初期盤面は岩なしなのでここには来ない想定）
  if (type === ROCK_TYPE) return false;
  // Check horizontal (left 2)
  if (c >= 2 && currentRow[c - 1].type === type && currentRow[c - 2].type === type) {
    return true;
  }
  // Check vertical (up 2)
  if (r >= 2 && board[r - 1][c].type === type && board[r - 2][c].type === type) {
    return true;
  }
  // Check 2x2 block (up-left, up, left)
  if (r >= 1 && c >= 1 &&
      board[r - 1][c].type === type &&
      currentRow[c - 1].type === type &&
      board[r - 1][c - 1].type === type) {
    return true;
  }
  return false;
}

// 盤面をディープコピー
export function cloneBoard(board: DinoCell[][]): DinoCell[][] {
  return board.map(row => row.map(cell => ({ ...cell })));
}

// 2つのセルを入れ替え
export function swapCells(
  board: DinoCell[][],
  r1: number,
  c1: number,
  r2: number,
  c2: number
): DinoCell[][] {
  const newBoard = cloneBoard(board);
  const temp = newBoard[r1][c1];
  newBoard[r1][c1] = newBoard[r2][c2];
  newBoard[r2][c2] = temp;
  return newBoard;
}

// マッチを検出
// 消える条件:
//   ① 直線3つ以上（横or縦）
//   ② 隣接4つ以上（形は問わない、斜め除く）
// 消えない: 2つだけ / 直線でない3つ
export interface Match {
  cells: [number, number][];
}

export function findMatches(board: DinoCell[][]): Match[] {
  // Step 1: 直線3つ以上をマーク（岩セルは常にrun終端扱い）
  const lineMatched = new Set<string>();

  // 横方向
  for (let r = 0; r < ROWS; r++) {
    let start = 0;
    for (let c = 1; c <= COLS; c++) {
      const startIsRock = board[r][start].type === ROCK_TYPE;
      const sameType = c < COLS && board[r][c].type === board[r][start].type && !startIsRock;
      if (sameType) continue;
      if (!startIsRock && c - start >= 3) {
        for (let i = start; i < c; i++) {
          lineMatched.add(`${r},${i}`);
        }
      }
      start = c;
    }
  }

  // 縦方向
  for (let c = 0; c < COLS; c++) {
    let start = 0;
    for (let r = 1; r <= ROWS; r++) {
      const startIsRock = board[start][c].type === ROCK_TYPE;
      const sameType = r < ROWS && board[r][c].type === board[start][c].type && !startIsRock;
      if (sameType) continue;
      if (!startIsRock && r - start >= 3) {
        for (let i = start; i < r; i++) {
          lineMatched.add(`${i},${c}`);
        }
      }
      start = r;
    }
  }

  // Step 2: 隣接する同種セルのグループを全て見つける（flood-fill・岩は独立グループ扱い）
  const allVisited = new Set<string>();
  const clusterGroups: { cells: [number, number][]; type: number }[] = [];

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const key = `${r},${c}`;
      if (allVisited.has(key)) continue;
      allVisited.add(key);

      const type = board[r][c].type;
      const group: [number, number][] = [[r, c]];
      const queue: [number, number][] = [[r, c]];

      while (queue.length > 0) {
        const [cr, cc] = queue.shift()!;
        const neighbors: [number, number][] = [[cr-1,cc],[cr+1,cc],[cr,cc-1],[cr,cc+1]];
        for (const [nr, nc] of neighbors) {
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
          const nkey = `${nr},${nc}`;
          if (allVisited.has(nkey)) continue;
          if (board[nr][nc].type !== type) continue;
          allVisited.add(nkey);
          group.push([nr, nc]);
          queue.push([nr, nc]);
        }
      }

      // 岩グループはマッチ判定対象外
      if (type === ROCK_TYPE) continue;
      clusterGroups.push({ cells: group, type });
    }
  }

  // Step 3: 消えるグループを判定
  // ① グループ内に直線マッチのセルが1つでもある → グループ全体が消える
  // ② グループが4つ以上 → 消える
  const finalMatched = new Set<string>();

  for (const group of clusterGroups) {
    const hasLineMatch = group.cells.some(([r, c]) => lineMatched.has(`${r},${c}`));
    const isBigCluster = group.cells.length >= 4;

    if (hasLineMatch || isBigCluster) {
      for (const [r, c] of group.cells) {
        finalMatched.add(`${r},${c}`);
      }
    }
  }

  if (finalMatched.size === 0) return [];

  // Step 4: 消えるセルをグループ化して返す（既にflood-fillで分かれている）
  const resultVisited = new Set<string>();
  const matches: Match[] = [];

  for (const key of finalMatched) {
    if (resultVisited.has(key)) continue;
    const [sr, sc] = key.split(',').map(Number);
    const type = board[sr][sc].type;
    const group: [number, number][] = [];
    const queue: [number, number][] = [[sr, sc]];
    resultVisited.add(key);

    while (queue.length > 0) {
      const [r, c] = queue.shift()!;
      group.push([r, c]);

      const neighbors: [number, number][] = [[r-1,c],[r+1,c],[r,c-1],[r,c+1]];
      for (const [nr, nc] of neighbors) {
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
        const nkey = `${nr},${nc}`;
        if (resultVisited.has(nkey)) continue;
        if (!finalMatched.has(nkey)) continue;
        if (board[nr][nc].type !== type) continue;
        resultVisited.add(nkey);
        queue.push([nr, nc]);
      }
    }

    matches.push({ cells: group });
  }

  return matches;
}

export interface FillResult {
  board: DinoCell[][];
  fallDistances: number[][]; // each cell's fall distance in rows
}

// マッチしたセルを消去し、落下＋補充を行う（落下距離も返す）
// pendingRocks > 0 のとき、上から補充される新規セルのうちランダム N 個を岩に置換（自然な落下スポーン）
export function removeAndFill(
  board: DinoCell[][],
  matches: Match[],
  pendingRocks: number = 0,
  rockHp: number = 1
): FillResult {
  const newBoard = cloneBoard(board);
  const toRemove = new Set<string>();
  const fallDistances: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(0));

  for (const match of matches) {
    for (const [r, c] of match.cells) {
      toRemove.add(`${r},${c}`);
    }
  }

  // 新規セル生成位置を記録（落下スポーン対象）
  const newCellPositions: [number, number][] = [];

  // 各列ごとに処理：消去→落下→補充
  for (let c = 0; c < COLS; c++) {
    // 残るセルを下から収集（元の行位置も記録）
    const remaining: { cell: DinoCell; origRow: number }[] = [];
    for (let r = ROWS - 1; r >= 0; r--) {
      if (!toRemove.has(`${r},${c}`)) {
        remaining.push({ cell: newBoard[r][c], origRow: r });
      }
    }
    const removedCount = ROWS - remaining.length;

    // 下から詰めて、上を新規セルで埋める
    for (let r = ROWS - 1; r >= 0; r--) {
      const idx = ROWS - 1 - r;
      if (idx < remaining.length) {
        newBoard[r][c] = remaining[idx].cell;
        fallDistances[r][c] = r - remaining[idx].origRow; // how far it fell
      } else {
        newBoard[r][c] = createCell();
        fallDistances[r][c] = removedCount;
        newCellPositions.push([r, c]);
      }
    }
  }

  // 岩スポーン: 新規セル位置からランダム N 個を岩に置換
  if (pendingRocks > 0 && newCellPositions.length > 0) {
    const shuffled = [...newCellPositions];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const placeCount = Math.min(pendingRocks, shuffled.length);
    for (let i = 0; i < placeCount; i++) {
      const [r, c] = shuffled[i];
      newBoard[r][c] = createRockCell(rockHp);
    }
  }

  return { board: newBoard, fallDistances };
}

// マッチ隣接の岩にダメージを与える
// 戻り値: 更新後の盤面 / 破壊された岩の位置 / 得点ボーナス
export function applyRockDamage(
  board: DinoCell[][],
  matchedCells: [number, number][]
): { board: DinoCell[][]; destroyed: [number, number][]; score: number } {
  const newBoard = cloneBoard(board);
  const matchedSet = new Set(matchedCells.map(([r, c]) => `${r},${c}`));
  const damagedPositions = new Set<string>();
  const destroyed: [number, number][] = [];
  let score = 0;

  for (const [r, c] of matchedCells) {
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      const nkey = `${nr},${nc}`;
      if (matchedSet.has(nkey)) continue;
      if (damagedPositions.has(nkey)) continue;
      const cell = newBoard[nr][nc];
      if (cell.type !== ROCK_TYPE) continue;
      damagedPositions.add(nkey);
      const newHp = (cell.hp ?? 1) - 1;
      if (newHp <= 0) {
        destroyed.push([nr, nc]);
        score += ROCK_DESTROY_SCORE;
      } else {
        newBoard[nr][nc] = { ...cell, hp: newHp };
      }
    }
  }
  return { board: newBoard, destroyed, score };
}

// マッチのスコアを計算（N個消し = N×10点 × 連鎖レベル）
export function calculateScore(matches: Match[], chainLevel: number): number {
  let score = 0;
  for (const match of matches) {
    const base = match.cells.length * 10;
    score += base * chainLevel;
  }
  return score;
}

// 1手で消費する回数（マッチしてもしなくても1回消費）
export const MOVE_COST = 1;

// 連鎖を全て解決し、最終盤面とスコアを返す
export function resolveChains(
  board: DinoCell[][]
): { board: DinoCell[][]; totalScore: number; chainCount: number } {
  let current = cloneBoard(board);
  let totalScore = 0;
  let chainCount = 0;

  while (true) {
    const matches = findMatches(current);
    if (matches.length === 0) break;
    chainCount++;
    totalScore += calculateScore(matches, chainCount);
    current = removeAndFill(current, matches).board;
  }

  return { board: current, totalScore, chainCount };
}

// 隣接セルかどうかチェック
export function isAdjacent(r1: number, c1: number, r2: number, c2: number): boolean {
  const dr = Math.abs(r1 - r2);
  const dc = Math.abs(c1 - c2);
  return (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
}

// 有効な手が存在するかチェック
export function hasValidMoves(board: DinoCell[][]): boolean {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      // 右と入れ替え
      if (c + 1 < COLS) {
        const swapped = swapCells(board, r, c, r, c + 1);
        if (findMatches(swapped).length > 0) return true;
      }
      // 下と入れ替え
      if (r + 1 < ROWS) {
        const swapped = swapCells(board, r, c, r + 1, c);
        if (findMatches(swapped).length > 0) return true;
      }
    }
  }
  return false;
}
