import { TrainSpecs, CustomizeState } from '../types';

export interface CalculatedSpecs {
  maxSpeed: number;        // km/h (モーターで上昇)
  acceleration: number;    // km/h/s (VVVFインバータで上昇)
  deceleration: number;    // km/h/s (ブレーキ装置で上昇)
  atsAssistLevel: number;  // 1 to 5 (停止アシスト、ブレーキレスポンス)
}

/**
 * カスタマイズレベルに基づいた電車の実効性能を算出する
 */
export function calculateTrainSpecs(baseSpecs: TrainSpecs, customs: CustomizeState): CalculatedSpecs {
  // モーターレベル (1 to 5): 1レベルごとに最高速度 + 6km/h (最大 +24km/h)
  const maxSpeed = baseSpecs.baseMaxSpeed + (customs.motor - 1) * 6;

  // VVVFレベル (1 to 5): 1レベルごとに加速度 + 0.3 km/h/s (最大 +1.2)
  const acceleration = baseSpecs.baseAcceleration + (customs.vvvf - 1) * 0.3;

  // ブレーキレベル (1 to 5): 1レベルごとに減速度 + 0.4 km/h/s (最大 +1.6)
  const deceleration = baseSpecs.baseDeceleration + (customs.brake - 1) * 0.4;

  return {
    maxSpeed,
    acceleration,
    deceleration,
    atsAssistLevel: customs.ats
  };
}

/**
 * アップグレードに必要なコスト（クレジット）
 */
export function getUpgradeCost(currentLevel: number): number {
  if (currentLevel >= 5) return 0; // 最大
  const costs = [150, 300, 500, 800]; // 1->2, 2->3, 3->4, 4->5
  return costs[currentLevel - 1] || 1000;
}
