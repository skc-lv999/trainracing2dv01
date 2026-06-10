import React, { useState } from 'react';
import { TrainType, TRAIN_TEMPLATES, PlayerSave, CustomizeState } from '../types';
import { calculateTrainSpecs, getUpgradeCost } from '../utils/physics';
import { 
  ArrowLeft, 
  Wrench, 
  ArrowUpCircle, 
  Gauge, 
  Zap, 
  ShieldAlert, 
  Award,
  HelpCircle,
  Coins
} from 'lucide-react';

interface CustomizeScreenProps {
  playerSave: PlayerSave;
  selectedTrainType: TrainType;
  onUpdateSave: (newSave: PlayerSave) => void;
  onClose: () => void;
}

export default function CustomizeScreen({
  playerSave,
  selectedTrainType,
  onUpdateSave,
  onClose
}: CustomizeScreenProps) {
  const [currentTrain, setCurrentTrain] = useState<TrainType>(selectedTrainType);

  const trainSpecs = TRAIN_TEMPLATES[currentTrain];
  const customs = playerSave.customs[currentTrain];

  const handleUpgrade = (item: keyof CustomizeState) => {
    const currentLevel = customs[item];
    if (currentLevel >= 5) return; // 既にMAX

    const cost = getUpgradeCost(currentLevel);
    if (playerSave.credits < cost) {
      alert("強化ポイント(PT)が不足しています！タイムアタックを完走してPTを稼ぎましょう。");
      return;
    }

    // アップグレード実行
    const updatedCustoms = {
      ...playerSave.customs,
      [currentTrain]: {
        ...customs,
        [item]: currentLevel + 1
      }
    };

    onUpdateSave({
      ...playerSave,
      credits: playerSave.credits - cost,
      customs: updatedCustoms
    });
  };

  // 効力スペック値の計算
  const calculated = calculateTrainSpecs(trainSpecs, customs);

  const items: {
    key: keyof CustomizeState;
    name: string;
    description: string;
    icon: React.ReactNode;
    currentVal: string;
    nextVal: string | null;
  }[] = [
    {
      key: 'motor',
      name: '主電動機 (トラクションモーター)',
      description: 'モーターを換装し、最高速度制限の限界値と高速度領域での伸びを向上させます。',
      icon: <Gauge className="w-5 h-5 text-blue-400" />,
      currentVal: `${calculated.maxSpeed} km/h`,
      nextVal: customs.motor < 5 
        ? `${baseSpecWithLevel('motor', customs.motor + 1).maxSpeed} km/h` 
        : null
    },
    {
      key: 'vvvf',
      name: 'VVVFインバータ (電力周波数制御)',
      description: '最新鋭のIGBTに換装し、電気の流れを最適化して起動時スリップを防ぎ、発車時の加速度をアップします。',
      icon: <Zap className="w-5 h-5 text-amber-400" />,
      currentVal: `${calculated.acceleration.toFixed(1)} km/h/s`,
      nextVal: customs.vvvf < 5 
        ? `${baseSpecWithLevel('vvvf', customs.vvvf + 1).acceleration.toFixed(1)} km/h/s` 
        : null
    },
    {
      key: 'brake',
      name: '回生制動 & 増粘着ブレーキ',
      description: '電制ブレーキとセラミック噴射滑り止めを強化。ブレーキのかかりを鋭く、停止直前のすべりも抑えます。',
      icon: <ShieldAlert className="w-5 h-5 text-red-400" />,
      currentVal: `${calculated.deceleration.toFixed(1)} km/h/s`,
      nextVal: customs.brake < 5 
        ? `${baseSpecWithLevel('brake', customs.brake + 1).deceleration.toFixed(1)} km/h/s` 
        : null
    },
    {
      key: 'ats',
      name: 'ATS停車位置・空転抑制制御装置',
      description: '駅停車線付近でのブレーキ自動応答や、雨の日でも空転しないトラクションコントロール技術、停止位置補正を施します。',
      icon: <HelpCircle className="w-5 h-5 text-purple-400" />,
      currentVal: customs.ats === 1 ? '標準' : customs.ats === 5 ? '極 (全支援)' : `アシスト Lv.${customs.ats}`,
      nextVal: customs.ats < 5 
        ? `アシスト Lv.${customs.ats + 1}` 
        : null
    }
  ];

  function baseSpecWithLevel(field: keyof CustomizeState, level: number) {
    const fakeCustoms = { ...customs, [field]: level };
    return calculateTrainSpecs(trainSpecs, fakeCustoms);
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 font-sans p-4 md:p-6" id="customize-screen">
      {/* 戻る ＆ タイトル */}
      <header className="flex flex-col sm:flex-row justify-between items-center bg-slate-900 border border-slate-800 rounded-xl p-4 mb-6 gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="bg-slate-950 border border-slate-800 hover:border-emerald-500 hover:text-emerald-400 p-2.5 rounded-lg text-slate-300 transition shrink-0 cursor-pointer flex items-center justify-center"
            title="メインへ戻る"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <Wrench className="w-5 h-5 text-emerald-400" />
              <span>総合総合車両チューニングセンター</span>
            </h1>
            <p className="text-xs text-slate-400">車両のコンポーネントをアップグレードしてタイムを更新！</p>
          </div>
        </div>

        {/* クレジット表示 */}
        <div className="bg-gradient-to-r from-amber-500/10 to-yellow-500/10 border border-amber-500/20 py-2 px-4 rounded-xl flex items-center gap-2.5">
          <Coins className="w-5 h-5 text-yellow-400 animate-spin-slow" />
          <div className="font-mono text-right">
            <span className="text-[10px] text-slate-400 block h-3">HOLDING CREDITS</span>
            <span className="text-xl font-bold text-yellow-300">
              {playerSave.credits.toLocaleString()} <span className="text-xs text-amber-400">PT</span>
            </span>
          </div>
        </div>
      </header>

      {/* チューニングレイアウト */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-grow items-start">
        {/* 左: 車両切り替え＆スペックプレビュー */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
            <h3 className="font-bold border-b border-slate-800 pb-2 text-slate-300 text-sm">強化対象の車両</h3>
            
            <div className="flex flex-col gap-2">
              {(Object.keys(TRAIN_TEMPLATES) as TrainType[]).map((type) => {
                const spec = TRAIN_TEMPLATES[type];
                const active = currentTrain === type;
                return (
                  <button
                    key={type}
                    onClick={() => setCurrentTrain(type)}
                    className={`p-3 rounded-lg text-left transition border cursor-pointer border-l-4 flex justify-between items-center ${
                      active
                        ? 'bg-slate-800 border-emerald-500 border-l-emerald-500 text-white font-bold'
                        : 'bg-slate-950 border-slate-850 hover:bg-slate-900 text-slate-400 hover:text-slate-200'
                    }`}
                    style={{ borderLeftColor: spec.color }}
                  >
                    <span>{spec.name}</span>
                    <span className="text-[10px] bg-slate-900 text-slate-400 px-1.5 py-0.5 rounded border border-slate-800">
                      編成中
                    </span>
                  </button>
                );
              })}
            </div>

            {/* 車両イメージプレビュー */}
            <div className="bg-slate-950 rounded-xl p-4 border border-slate-850 flex flex-col items-center justify-center gap-3 py-6">
              <div 
                className="w-48 h-10 rounded-lg shadow-md flex items-center justify-between px-3 text-slate-950 font-bold relative animate-pulse"
                style={{ backgroundColor: trainSpecs.color }}
              >
                <div className="w-1 bg-white h-7 rounded" />
                <span className="text-sm font-mono tracking-wider">{trainSpecs.type}系 TA-MOD</span>
                <div className="flex gap-1">
                  <span className="w-3 h-3 bg-red-600 rounded-full inline-block animate-ping" />
                  <span className="w-1.5 bg-yellow-400 h-6 rounded" />
                </div>
              </div>
              <p className="text-[11px] text-slate-400 text-center leading-relaxed">
                {trainSpecs.name}はベース性能が {trainSpecs.baseMaxSpeed}km/h です。チューニングにより制限速度への追従性能、各駅間ダッシュの反応が化けます。
              </p>
            </div>
          </div>
        </div>

        {/* 右: 4つのパワーアップカテゴリー */}
        <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-md space-y-4">
          <h3 className="font-bold border-b border-slate-800 pb-2 text-slate-300 text-sm flex items-center gap-1.5">
            <Award className="w-4 h-4 text-emerald-400" />
            <span>チューニングスロット (各種パーツ強化)</span>
          </h3>

          <div className="space-y-4">
            {items.map((item) => {
              const currentLevel = customs[item.key];
              const isMax = currentLevel >= 5;
              const cost = getUpgradeCost(currentLevel);
              const canAfford = playerSave.credits >= cost && !isMax;

              return (
                <div 
                  key={item.key}
                  className="bg-slate-950 border border-slate-850 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:border-slate-800 transition"
                >
                  {/* パーツ詳細 */}
                  <div className="flex gap-3.5 items-start min-w-0 max-w-lg">
                    <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-lg shrink-0 mt-0.5">
                      {item.icon}
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-200 flex items-center gap-2">
                        {item.name}
                        <span className="text-xs bg-emerald-950 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-900/40">
                          Lv.{currentLevel} / 5
                        </span>
                      </h4>
                      <p className="text-xs text-slate-400 mt-1 leading-normal">
                        {item.description}
                      </p>

                      {/* レベルインジケーター */}
                      <div className="flex gap-1.5 mt-2.5">
                        {[1, 2, 3, 4, 5].map((lvl) => {
                          const filled = lvl <= currentLevel;
                          return (
                            <span 
                              key={lvl}
                              className={`h-1.5 w-6 rounded-full inline-block transition ${
                                filled ? 'bg-emerald-500' : 'bg-slate-800'
                              }`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* 強化ボタンとパラメータ変動 */}
                  <div className="flex sm:flex-col items-end gap-3 w-full sm:w-auto shrink-0 border-t sm:border-t-0 border-slate-850 pt-3 sm:pt-0 justify-between sm:justify-center">
                    {/* 数値変化 */}
                    <div className="text-right font-mono">
                      <span className="text-xs text-slate-500 block">Performance</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-300 font-bold text-xs">{item.currentVal}</span>
                        {!isMax && (
                          <>
                            <span className="text-slate-500">➔</span>
                            <span className="text-emerald-400 font-bold text-xs">{item.nextVal}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* レベルアップボタン */}
                    {isMax ? (
                      <span className="text-xs font-bold text-slate-500 bg-slate-900 border border-slate-800 px-4 py-2 rounded-lg cursor-not-allowed">
                        MAX LEVEL (完スト)
                      </span>
                    ) : (
                      <button
                        onClick={() => handleUpgrade(item.key)}
                        disabled={playerSave.credits < cost}
                        className={`w-full sm:w-auto px-4 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow ${
                          canAfford
                            ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                            : 'bg-slate-900 text-slate-500 border border-slate-800 hover:border-red-500/30'
                        }`}
                      >
                        <ArrowUpCircle className="w-4 h-4" />
                        <span>強化する</span>
                        <span className="font-mono text-[10px] bg-slate-950/40 px-1 py-0.5 rounded text-yellow-300">
                          {cost}PT
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
