export type TrainType = 'E231' | 'E233' | 'E235';

export interface TrainSpecs {
  name: string;
  type: TrainType;
  baseMaxSpeed: number; // km/h
  baseAcceleration: number; // km/h/s (起動加速度)
  baseDeceleration: number; // km/h/s (常用最大減速度)
  color: string;
  gaugeBg: string;
  description: string;
}

export interface CustomizeState {
  motor: number; // 輝度モーター (最高速度アップ: 1 to 5)
  vvvf: number;  // 起動加速度アップ (1 to 5)
  brake: number; // ブレーキ減速度アップ (1 to 5)
  ats: number;   // 空転防止/停車支援 (1 to 5)
}

export interface PlayerSave {
  credits: number; // ゲームプレイで貯まるポイント
  customs: Record<TrainType, CustomizeState>;
  playerName: string;
}

export interface Route {
  id: string;
  name: string;
  description: string;
  stations: Station[];
  totalDistance: number; // メートル
  difficulty: '★☆☆' | '★★☆' | '★★★';
  imagePrompt: string;
}

export interface Station {
  name: string;
  distance: number; // スタート地点からの位置 (メートル)
  speedLimit: number; // この駅周辺・手前の制限速度 (km/h)
}

// タイムアタック中の一時的リミット情報
export interface SpeedLimitZone {
  start: number; // スタートからのメートル
  end: number;
  limit: number; // km/h
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  routeId: string;
  trainType: TrainType;
  time: number; // 走行時間 (秒、少数点2桁)
  penaltyTime: number; // ペナルティ時間 (秒、少数点2桁)
  totalScoreTime: number; // 最終タイム = 走行時間 + ペナルティ時間
  customs: CustomizeState;
  createdAt: string; // ISO 8601 string or date
  isLocal?: boolean; // ローカルリーダーボードかどうか
}

export const TRAIN_TEMPLATES: Record<TrainType, TrainSpecs> = {
  E231: {
    type: 'E231',
    name: 'E231系 (緑帯・近郊/通勤形)',
    baseMaxSpeed: 100,
    baseAcceleration: 2.5,
    baseDeceleration: 3.5,
    color: '#22c55e', // green
    gaugeBg: 'bg-emerald-500',
    description: '国鉄からJR東日本への移行期に登場したベストセラー車両。全体的にバランスが取れた標準性能です。'
  },
  E233: {
    type: 'E233',
    name: 'E233系 (橙帯・中央快速形)',
    baseMaxSpeed: 110,
    baseAcceleration: 3.0,
    baseDeceleration: 4.0,
    color: '#f97316', // orange
    gaugeBg: 'bg-orange-500',
    description: '高い加速度と二重化された主要機器を備える高規格車両。初速の立ち上がりが鋭く、ストップ＆ゴーに強みを発揮します。'
  },
  E235: {
    type: 'E235',
    name: 'E235系 (黄緑帯・次世代電子形)',
    baseMaxSpeed: 120,
    baseAcceleration: 2.8,
    baseDeceleration: 4.5,
    color: '#84cc16', // lime green
    gaugeBg: 'bg-lime-500',
    description: '山手線等で大活躍中の最新鋭車両。強力な制動装置とデジタル制御のブレーキにより、非常に制御しやすく滑らかな減速が可能です。'
  }
};

export const ROUTES: Route[] = [
  {
    id: 'yamanote',
    name: '山手線タイムアタック',
    description: '駅間が短く、頻繁な停車が求められる路線。停止位置の正確さと、素早いブレーキ操作がタイム短縮の鍵となります。',
    difficulty: '★☆☆',
    totalDistance: 2400,
    stations: [
      { name: '東京 (始発)', distance: 0, speedLimit: 60 },
      { name: '有楽町', distance: 800, speedLimit: 80 },
      { name: '新橋 (終点)', distance: 1800, speedLimit: 75 },
      { name: '浜松町 (最終目的地)', distance: 2400, speedLimit: 0 }
    ],
    imagePrompt: 'Yamanote line visual'
  },
  {
    id: 'chuo',
    name: '中央快速線タイムアタック',
    description: '主要駅を結ぶ高速路線。直線が長く、最高速度まで引っ張ることができますが、高運転速度からの停車タイミングが試されます。',
    difficulty: '★★☆',
    totalDistance: 4500,
    stations: [
      { name: '新宿 (始発)', distance: 0, speedLimit: 70 },
      { name: '四ツ谷', distance: 1800, speedLimit: 95 },
      { name: '御茶ノ水 (終点)', distance: 4500, speedLimit: 0 }
    ],
    imagePrompt: 'Chuo line rapid visual'
  },
  {
    id: 'shonan',
    name: '湘南新宿ライン競走',
    description: '駅間が極めて長く、120km/hの最高速バトルが展開されます。しかし急カーブでの速度制限やATC信号を無視すると手痛いペナルティが！',
    difficulty: '★★★',
    totalDistance: 6000,
    stations: [
      { name: '渋谷 (始発)', distance: 0, speedLimit: 80 },
      { name: '恵比寿', distance: 2000, speedLimit: 110 },
      { name: '大崎 (最終目的地)', distance: 6000, speedLimit: 0 }
    ],
    imagePrompt: 'Shonan Shinjuku line visual'
  }
];

// 各路線ごとの制限速度区間 (スタートからの距離ベースで適用)
export const SPEED_LIMITS: Record<string, SpeedLimitZone[]> = {
  yamanote: [
    { start: 300, end: 550, limit: 65 },
    { start: 1200, end: 1500, limit: 70 }
  ],
  chuo: [
    { start: 800, end: 1200, limit: 80 },
    { start: 2500, end: 3200, limit: 90 }
  ],
  shonan: [
    { start: 500, end: 1200, limit: 60 }, // 急カーブ
    { start: 3200, end: 4000, limit: 95 }, // 踏切注意
    { start: 4800, end: 5400, limit: 80 }  // ポイント通過
  ]
};
