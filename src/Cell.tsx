import React, { useEffect, useRef } from 'react';
import { View, Image, StyleSheet, Animated } from 'react-native';
import { DINO_IMAGES } from './dinoImages';

interface CellProps {
  type: number;
  size: number;
  isSelected: boolean;
  isSwapTarget?: boolean;
  isSkillPreview?: boolean;
  isMatched: boolean;
  isRemoving: boolean;
  isExploding?: boolean;
  animateIn?: boolean;
  cellKey?: string;
}

export default function Cell({ type, size, isSelected, isSwapTarget = false, isSkillPreview = false, isMatched, isRemoving, isExploding = false, animateIn = false, cellKey }: CellProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const prevCellKey = useRef(cellKey);
  const prevExploding = useRef(false);

  useEffect(() => {
    if (isExploding && !prevExploding.current) {
      // 爆発エフェクト: 拡大→消滅
      scale.setValue(1);
      opacity.setValue(1);
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.5, duration: 100, useNativeDriver: true }),
        Animated.parallel([
          Animated.timing(scale, { toValue: 0.1, duration: 200, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]),
      ]).start();
    } else if (animateIn && prevCellKey.current !== cellKey) {
      scale.setValue(0.9);
      opacity.setValue(0.5);
      Animated.parallel([
        Animated.timing(scale, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: true }),
      ]).start();
    } else if (!isExploding && !animateIn) {
      scale.setValue(1);
      opacity.setValue(1);
    }
    prevCellKey.current = cellKey;
    prevExploding.current = isExploding;
  }, [cellKey, animateIn, isExploding]);

  return (
    <Animated.View
      style={[
        styles.cell,
        {
          width: size,
          height: size,
          borderWidth: (isSelected || isSwapTarget || isSkillPreview) ? 3 : 0,
          borderColor: isSkillPreview ? '#FF5252' : isSwapTarget ? '#FF5252' : isSelected ? '#4FC3F7' : 'transparent',
          backgroundColor: isRemoving ? 'transparent' : isSkillPreview ? 'rgba(255,82,82,0.3)' : '#2a2a4e',
          transform: [{ scale }],
          opacity,
        },
      ]}
    >
      {!isRemoving && (
        <>
          <Image
            source={DINO_IMAGES[type]}
            style={{ width: size - 8, height: size - 8 }}
            resizeMode="contain"
          />
          {isMatched && <View style={styles.glow} />}
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cell: {
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  glow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,200,0.5)',
    borderRadius: 8,
  },
});
