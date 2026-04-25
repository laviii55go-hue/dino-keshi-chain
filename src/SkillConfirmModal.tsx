import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { DINO_IMAGES } from './dinoImages';
import { DINO_NAMES, SKILL_TRIGGER_COUNTS } from './gameLogic';

interface Props {
  skillType: number | null;
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const SKILL_NAME: Record<number, string> = {
  0: '草食恐竜 全消し',
  1: '同種 全消し',
  2: 'ランダム10個 爆破',
  3: '横一列 突進',
  4: '周囲8マス 水撃',
  5: '縦一直線＋着弾点 頭突き',
};

const SKILL_DESC: Record<number, string> = {
  0: '盤面の草食恐竜（ステゴ・トリケラ・パキケファロ）をすべて消します。岩は対象外。',
  1: 'タップした恐竜と同じ種類をすべて消します。岩は対象外。',
  2: '盤面からランダムに10個を爆破。岩にはHP-1ダメージ。',
  3: 'タップした行を横一列に突進して消します。岩にはHP-1ダメージ。',
  4: 'タップしたマスの周囲8マス＋自分を水撃で消します。岩にはHP-1ダメージ。',
  5: 'タップした列を縦一直線に頭突き、着弾点（最下段）とその周囲も消します。岩にはHP-1ダメージ。',
};

const NEEDS_TARGET = [1, 3, 4, 5]; // ステゴ、トリケラ、スピノ、パキケファロ

const TARGET_HINT: Record<number, string> = {
  0: '発動すると草食恐竜をすべて消します',
  1: '発動後、消したい恐竜をタップしてください',
  2: '発動するとランダム10マスが爆破されます',
  3: '発動後、消したい行をタップしてください',
  4: '発動後、中心となるマスをタップしてください',
  5: '発動後、頭突きする列をタップしてください',
};

// 影響範囲プレビュー図（6×6 のミニ盤面で範囲を示す）
const MINI_ROWS = 6;
const MINI_COLS = 6;
const MINI_CELL = 22;
const MINI_GAP = 2;

type CellMark = 'target' | 'affected' | 'question' | 'random' | 'none' | 'herb';

function getPreviewPattern(skillType: number): CellMark[][] {
  const grid: CellMark[][] = Array.from({ length: MINI_ROWS }, () =>
    Array.from({ length: MINI_COLS }, () => 'none')
  );
  switch (skillType) {
    case 0: {
      // ティラノ: 草食恐竜全消し（飛び石パターンで草食を示す）
      const pattern = [
        [0,1,0,1,0,1],
        [1,0,1,0,0,1],
        [0,1,0,1,1,0],
        [1,0,0,0,1,0],
        [0,1,1,0,0,1],
        [1,0,0,1,1,0],
      ];
      for (let r = 0; r < MINI_ROWS; r++)
        for (let c = 0; c < MINI_COLS; c++)
          if (pattern[r][c]) grid[r][c] = 'herb';
      break;
    }
    case 1: {
      // ステゴ: 指定種類全消し（？マークの箇所が指定）
      grid[2][2] = 'question';
      const pattern = [[0,2],[1,4],[2,2],[3,0],[3,5],[4,3],[5,1]];
      for (const [r, c] of pattern) grid[r][c] = 'affected';
      grid[2][2] = 'question';
      break;
    }
    case 2: {
      // プテラ: ランダム10個
      const pattern: [number, number][] = [[0,1],[0,4],[1,0],[1,3],[2,5],[3,1],[3,4],[4,2],[5,0],[5,3]];
      for (const [r, c] of pattern) grid[r][c] = 'random';
      break;
    }
    case 3: {
      // トリケラ: 横一列
      for (let c = 0; c < MINI_COLS; c++) grid[2][c] = 'affected';
      grid[2][0] = 'target';
      break;
    }
    case 4: {
      // スピノ: 周囲8マス＋自分（3×3）
      const tr = 2, tc = 3;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const nr = tr + dr, nc = tc + dc;
          if (nr >= 0 && nr < MINI_ROWS && nc >= 0 && nc < MINI_COLS) grid[nr][nc] = 'affected';
        }
      grid[tr][tc] = 'target';
      break;
    }
    case 5: {
      // パキケファロ: 縦一直線＋着弾点（最下段）周囲
      const tc = 2;
      for (let r = 0; r < MINI_ROWS; r++) grid[r][tc] = 'affected';
      // 着弾点（最下段）周囲
      const impactR = MINI_ROWS - 1;
      const offsets: [number, number][] = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1]];
      for (const [dr, dc] of offsets) {
        const nr = impactR + dr, nc = tc + dc;
        if (nr >= 0 && nr < MINI_ROWS && nc >= 0 && nc < MINI_COLS) grid[nr][nc] = 'affected';
      }
      grid[0][tc] = 'target'; // 発射点
      break;
    }
  }
  return grid;
}

function MiniPreview({ skillType }: { skillType: number }) {
  const grid = getPreviewPattern(skillType);
  return (
    <View style={styles.mini}>
      {grid.map((row, r) => (
        <View key={r} style={styles.miniRow}>
          {row.map((mark, c) => (
            <View
              key={c}
              style={[
                styles.miniCell,
                mark === 'target' && styles.miniTarget,
                mark === 'affected' && styles.miniAffected,
                mark === 'question' && styles.miniQuestion,
                mark === 'random' && styles.miniRandom,
                mark === 'herb' && styles.miniHerb,
              ]}
            >
              {mark === 'question' && <Text style={styles.miniQuestionText}>?</Text>}
              {mark === 'random' && <Text style={styles.miniRandomText}>✦</Text>}
              {mark === 'target' && <Text style={styles.miniTargetText}>◎</Text>}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

export default function SkillConfirmModal({ skillType, visible, onConfirm, onCancel }: Props) {
  if (!visible || skillType === null) return null;

  const name = DINO_NAMES[skillType];
  const skillName = SKILL_NAME[skillType];
  const desc = SKILL_DESC[skillType];
  const hint = TARGET_HINT[skillType];
  const count = SKILL_TRIGGER_COUNTS[skillType] ?? 6;
  const needsTarget = NEEDS_TARGET.includes(skillType);

  return (
    <View style={styles.overlay}>
      <View style={styles.box}>
        <View style={styles.header}>
          <Image source={DINO_IMAGES[skillType]} style={styles.dinoIcon} resizeMode="contain" />
          <View style={styles.headerText}>
            <Text style={styles.dinoName}>{name}</Text>
            <Text style={styles.skillName}>{skillName}</Text>
            <Text style={styles.counter}>{count}個で獲得・発動で残数+1</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>影響範囲</Text>
        <MiniPreview skillType={skillType} />

        <Text style={styles.desc}>{desc}</Text>

        <View style={styles.hintBox}>
          <Text style={styles.hintIcon}>{needsTarget ? '👇' : '⚡'}</Text>
          <Text style={styles.hintText}>{hint}</Text>
        </View>

        <View style={styles.buttons}>
          <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={onCancel}>
            <Text style={styles.cancelText}>キャンセル</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.confirmButton]} onPress={onConfirm}>
            <Text style={styles.confirmText}>発動する</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footNote}>※ 同じ恐竜の次回タップからは確認なしで発動します（設定の「初心者モード」でON可）</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 250,
    elevation: 25,
  },
  box: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    width: '88%',
    maxWidth: 380,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  dinoIcon: {
    width: 88,
    height: 88,
  },
  headerText: {
    flex: 1,
    marginLeft: 14,
  },
  dinoName: {
    color: '#FFD700',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  skillName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  counter: {
    color: '#aaa',
    fontSize: 11,
  },
  sectionLabel: {
    color: '#FFD700',
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 4,
    marginBottom: 6,
  },
  mini: {
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 8,
    padding: MINI_GAP,
    marginBottom: 10,
  },
  miniRow: {
    flexDirection: 'row',
  },
  miniCell: {
    width: MINI_CELL,
    height: MINI_CELL,
    margin: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniTarget: {
    backgroundColor: '#FFD700',
  },
  miniTargetText: {
    color: '#1a1a2e',
    fontSize: 12,
    fontWeight: 'bold',
  },
  miniAffected: {
    backgroundColor: '#e94560',
    opacity: 0.85,
  },
  miniQuestion: {
    backgroundColor: '#4FC3F7',
  },
  miniQuestionText: {
    color: '#1a1a2e',
    fontSize: 14,
    fontWeight: 'bold',
  },
  miniRandom: {
    backgroundColor: '#FF8E3C',
  },
  miniRandomText: {
    color: '#fff',
    fontSize: 10,
  },
  miniHerb: {
    backgroundColor: '#6BCB77',
  },
  desc: {
    color: '#fff',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 10,
    textAlign: 'center',
  },
  hintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,215,0,0.12)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.4)',
  },
  hintIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  hintText: {
    color: '#FFD700',
    fontSize: 13,
    fontWeight: 'bold',
    flex: 1,
  },
  buttons: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: 'rgba(255,82,82,0.2)',
    borderWidth: 1,
    borderColor: '#FF5252',
  },
  cancelText: {
    color: '#FF5252',
    fontSize: 15,
    fontWeight: 'bold',
  },
  confirmButton: {
    backgroundColor: '#FFD700',
  },
  confirmText: {
    color: '#1a1a2e',
    fontSize: 15,
    fontWeight: 'bold',
  },
  footNote: {
    color: '#888',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 14,
  },
});
