import { useState, useEffect } from 'react';
import { Route, TrainType, TRAIN_TEMPLATES, PlayerSave } from '../types';
import { submitLeaderboardEntry } from '../db';
import { 
  Trophy, 
  Send, 
  Coins, 
  ChevronRight, 
  RotateCcw, 
  CheckCircle2, 
  AlertTriangle,
  Timer,
  RefreshCw,
  Gauge
} from 'lucide-react';

interface ResultScreenProps {
  route: Route;
  trainType: TrainType;
  finalTime: number; // 秒
  penaltyTime: number; // 秒
  playerSave: PlayerSave;
  onUpdateSave: (newSave: PlayerSave) => void;
  onReset: () => void;
}

export default function ResultScreen({
  route,
  trainType,
  finalTime,
  penaltyTime,
  playerSave,
  onUpdateSave,
  onReset
}: ResultScreenProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ポイント（PT）獲得の計算
  // 基礎ポイント
  const baseReward = route.id === 'yamanote' ? 150 : route.id === 'chuo' ? 250 : 350;
  // 停車精度：ペナルティ時間が0なら特別ボーナス。少ないほど上乗せ
  const accuracyBonus = Math.max(0, Math.floor((10 - penaltyTime) * 15));
  const noPenaltyBonus = penaltyTime === 0 ? 150 : 0;
  const totalEarnedCredits = baseReward + accuracyBonus + noPenaltyBonus;

  // 1度だけポイントを加算してセーブする
  useEffect(() => {
    onUpdateSave({
      ...playerSave,
      credits: playerSave.credits + totalEarnedCredits
    });
  }, [finalTime, penaltyTime]); // マウント時に1度だけ走る配列

  const totalScoreTime = Number((finalTime + penaltyTime).toFixed(2));

  // オンラインランキング送信
  const handleSubmitRanking = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await submitLeaderboardEntry(
        route.id,
        playerSave.playerName,
        trainType,
        finalTime,
        penaltyTime,
        playerSave.customs[trainType]
      );
      setSubmitted(true);
    } catch (e) {
      console.error(e);
      setErrorMsg("ランキング送信中にエラーが発生しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  const trainSpecs = TRAIN_TEMPLATES[trainType];

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 font-sans p-4 md:p-6" id="result-screen">
      <div className="max-w-xl mx-auto w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-2xl flex flex-col gap-6 my-auto">
        
        {/* レコードタイトル */}
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 bg-yellow-500/10 text-yellow-400 rounded-full border border-yellow-500/20 mb-2">
            <Trophy className="w-8 h-8 animate-bounce" />
          </div>
          <h1 className="text-2xl font-black bg-gradient-to-r from-yellow-400 to-amber-300 bg-clip-text text-transparent tracking-tight">
            タイムアタック 完走リザルト！
          </h1>
          <p className="text-xs text-slate-400 px-4">
            {route.name} にて無事に終点まで走り抜きました。
          </p>
        </div>

        {/* タイム記録表示板（JRの電光掲示板風） */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 font-mono shadow-inner relative overflow-hidden">
          <span className="absolute top-2 right-3 text-[8px] text-slate-600">OFFICIAL LED REGISTER</span>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <span className="text-[10px] text-slate-500 block">⏱ 実走行時間 (DRIVETIME)</span>
              <span className="text-xl font-bold tabular-nums text-slate-200">
                {finalTime.toFixed(2)} <span className="text-[11px] text-slate-500">秒</span>
              </span>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] text-slate-500 block flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                ペナルティ (PENALTY)
              </span>
              <span className="text-xl font-bold tabular-nums text-red-400">
                +{penaltyTime.toFixed(1)} <span className="text-[11px] text-slate-500">秒</span>
              </span>
            </div>
          </div>

          <div className="border-t border-slate-800 my-3 pb-1" />

          {/* 最終得点タイム */}
          <div className="text-center space-y-1">
            <span className="text-xs text-amber-500 uppercase tracking-widest block font-bold">TOTAL SCORE TIME</span>
            <span className="text-4xl font-extrabold text-yellow-400 tracking-tight tabular-nums block">
              {totalScoreTime} <span className="text-lg text-yellow-500 font-bold font-sans">秒</span>
            </span>
          </div>
        </div>

        {/* ポイント獲得 & レベル */}
        <div className="bg-slate-950/60 border border-slate-850 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-500/20 text-yellow-400 rounded-lg">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">EARNED CREDIT POINTS</span>
              <span className="text-md font-bold text-yellow-300">
                +{totalEarnedCredits} <span className="text-xs text-amber-400 font-mono">PT</span>
              </span>
            </div>
          </div>

          <div className="text-right text-[10px] space-y-0.5 text-slate-400 font-mono border-l border-slate-850 pl-4 shrink-0">
            <div>
              <span className="text-slate-500">完走報酬:</span> <span className="text-white">+{baseReward}PT</span>
            </div>
            <div>
              <span className="text-slate-500">正確さボーナス:</span> <span className="text-white">+{accuracyBonus}PT</span>
            </div>
            {noPenaltyBonus > 0 && (
              <div className="text-emerald-400 font-bold">
                <span>ノーペナボーナス:</span> <span>+{noPenaltyBonus}PT</span>
              </div>
            )}
          </div>
        </div>

        {/* ランキング登録ボタン */}
        <div className="space-y-3">
          {submitted ? (
            <div className="bg-emerald-950/30 border border-emerald-500/40 rounded-xl p-3 text-center text-xs text-emerald-400 flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>全国ランキングへのタイム送信が完了しました！</span>
            </div>
          ) : (
            <button
              onClick={handleSubmitRanking}
              disabled={isSubmitting}
              className={`w-full py-3 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-lg ${
                isSubmitting 
                  ? 'bg-slate-800 text-slate-400 border border-slate-700' 
                  : 'bg-gradient-to-r from-yellow-400 to-amber-500 text-slate-950 hover:from-yellow-300 hover:to-amber-400'
              }`}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>記録をサーバーに送信中...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 fill-slate-950" />
                  <span>このタイムを全国ランキングに登録する！</span>
                </>
              )}
            </button>
          )}

          {errorMsg && (
            <p className="text-[10px] text-red-400 text-center font-mono">
              ※ {errorMsg} (インターネット接続状態か、設定を確認してください)
            </p>
          )}
        </div>

        {/* 行先案内 ＆ タイトルへ戻る */}
        <div className="grid grid-cols-2 gap-3 mt-1">
          <div className="bg-slate-950 p-2 rounded-lg border border-slate-850 text-[10px] leading-relaxed">
            <span className="text-slate-500 block font-mono">USED VEHICLE:</span>
            <span className="font-bold text-slate-200" style={{ color: trainSpecs.color }}>
              {trainSpecs.name}
            </span>
            <span className="block text-[8px] text-slate-500">
              (Motor Lvl.{playerSave.customs[trainType].motor} / Brake Lvl.{playerSave.customs[trainType].brake})
            </span>
          </div>

          <button
            onClick={onReset}
            className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold py-3.5 px-4 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
          >
            <RotateCcw className="w-4 h-4" />
            <span>タイトル・カスタムへ</span>
          </button>
        </div>

      </div>
    </div>
  );
}
