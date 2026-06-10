import { useState, useEffect } from 'react';
import { 
  TRAIN_TEMPLATES, 
  ROUTES, 
  TrainType, 
  PlayerSave, 
  Route, 
  LeaderboardEntry 
} from '../types';
import { calculateTrainSpecs } from '../utils/physics';
import { getLeaderboard, getFirebaseStatus } from '../db';
import { 
  Trophy, 
  Gauge, 
  Play, 
  User, 
  Edit, 
  Settings2, 
  RefreshCw,
  Zap,
  ShieldAlert,
  HelpCircle,
  Database
} from 'lucide-react';

interface TitleScreenProps {
  playerSave: PlayerSave;
  onUpdateSave: (newSave: PlayerSave) => void;
  onStartGame: (route: Route, trainType: TrainType) => void;
  onOpenCustomize: (trainType: TrainType) => void;
}

export default function TitleScreen({
  playerSave,
  onUpdateSave,
  onStartGame,
  onOpenCustomize
}: TitleScreenProps) {
  const [selectedTrain, setSelectedTrain] = useState<TrainType>('E235');
  const [selectedRoute, setSelectedRoute] = useState<Route>(ROUTES[0]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState<boolean>(false);
  const [isEditingName, setIsEditingName] = useState<boolean>(false);
  const [tempName, setTempName] = useState<string>(playerSave.playerName);
  const [fbStatus, setFbStatus] = useState(getFirebaseStatus());
  const [step, setStep] = useState<'intro' | 'route_select' | 'lobby'>('intro');

  // 路線やタブが変わったときにランキングを取得
  const fetchRankings = async () => {
    setLoadingLeaderboard(true);
    try {
      const records = await getLeaderboard(selectedRoute.id);
      setLeaderboard(records);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingLeaderboard(false);
    }
  };

  useEffect(() => {
    fetchRankings();
  }, [selectedRoute]);

  const handleSaveName = () => {
    const trimmed = tempName.trim();
    if (trimmed.length > 0 && trimmed.length <= 15) {
      onUpdateSave({
        ...playerSave,
        playerName: trimmed
      });
      setIsEditingName(false);
    } else {
      alert("プレイヤー名は1〜15文字以内で入力してください。");
    }
  };

  const currentSpecs = TRAIN_TEMPLATES[selectedTrain];
  const customState = playerSave.customs[selectedTrain];
  const calculated = calculateTrainSpecs(currentSpecs, customState);

  // マックス値に対する割合 (バー表示用)
  const maxSpeedPercent = Math.min((calculated.maxSpeed / 150) * 100, 100);
  const accelPercent = Math.min((calculated.acceleration / 5) * 100, 100);
  const decelPercent = Math.min((calculated.deceleration / 6) * 100, 100);
  const atsPercent = (calculated.atsAssistLevel / 5) * 100;

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 font-sans p-4 md:p-6" id="app-title-screen">
      {step === 'intro' ? (
        <div className="flex-grow flex flex-col items-center justify-center max-w-3xl mx-auto w-full py-10 px-4 text-center select-none" id="title-intro-scene">
          {/* LED表示付きの近代的な電車のフロントマスク（CSSデコレーション） */}
          <div className="w-56 h-36 bg-slate-900 border-[3px] border-slate-800 rounded-2xl relative shadow-2xl flex flex-col items-center justify-between p-3 overflow-hidden mb-8">
            {/* 上部行き先表示器 (LED) */}
            <div className="w-2/3 h-6 bg-black border border-slate-800 rounded flex items-center justify-center font-mono my-1 gap-1">
              <span className="text-[9px] text-amber-500 font-bold tracking-widest animate-pulse">快速</span>
              <span className="text-[10px] text-emerald-400 font-black tracking-widest">トレインレーシング</span>
            </div>
            
            {/* 運転室フロントガラス */}
            <div className="w-full h-12 bg-slate-950 border-b border-slate-800 rounded flex items-end justify-between px-3 relative">
              {/* 運転士シルエット */}
              <div className="w-4 h-4 rounded-full bg-slate-850 absolute left-8 bottom-1 flex items-center justify-center">
                <div className="w-2.5 h-1.5 bg-slate-700 rounded-t-sm" />
              </div>
              <div className="text-[8px] text-red-500 font-bold absolute right-4 top-1 font-mono tracking-tighter">ATC 70</div>
            </div>

            {/* 前照灯 (ヘッドライト) */}
            <div className="w-full flex justify-between px-4 mt-2">
              <div className="flex gap-1 items-center">
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-300 shadow-[0_0_12px_#fde047] animate-pulse" />
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-350 shadow-[0_0_8px_#fde047]" />
              </div>
              <div className="flex gap-1 items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-350 shadow-[0_0_8px_#fde047]" />
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-300 shadow-[0_0_12px_#fde047] animate-pulse" />
              </div>
            </div>

            {/* 排障器 (スカート) */}
            <div className="absolute -bottom-1 w-11/12 h-3 bg-slate-950 border-t border-slate-800 rounded-t-sm" />
          </div>

          {/* タイトルセクション */}
          <div className="space-y-4 mb-10">
            <div className="inline-flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1 rounded-full text-xs font-mono text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>TRAIN SPEED ADVENTURE</span>
            </div>
            
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-widest bg-gradient-to-r from-emerald-400 via-teal-300 to-lime-300 bg-clip-text text-transparent filter drop-shadow">
              トレインレーシング２D
            </h1>
            
            <p className="text-xs sm:text-sm md:text-base text-slate-400 max-w-lg mx-auto leading-relaxed">
              0.1秒、0.1メートルの極限停車に挑め。<br />
              加速、減速度をチューンアップし、全国ランキングを制覇せよ。
            </p>
          </div>

          {/* 巨大なスタートボタン */}
          <div className="space-y-6 w-full max-w-md mx-auto">
            <button
              onClick={() => {
                setStep('route_select');
              }}
              className="w-full bg-gradient-to-r from-emerald-500 to-lime-500 text-slate-950 hover:from-emerald-400 hover:to-lime-400 font-black py-4.5 px-8 rounded-2xl text-xl shadow-2xl shadow-emerald-500/10 active:scale-[0.98] transition-all duration-300 cursor-pointer flex items-center justify-center gap-3 group"
            >
              <Play className="w-6 h-6 fill-slate-950 group-hover:translate-x-1 transition-transform" />
              <span>乗 務 開 始 ( START GAME )</span>
            </button>

            {/* サブ設定: 運転士ネーム ＆ クレジット */}
            <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-emerald-400" />
                {isEditingName ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={tempName}
                      onChange={(e) => setTempName(e.target.value)}
                      maxLength={15}
                      className="bg-slate-800 border border-emerald-500 rounded px-2 py-0.5 text-xs text-white focus:outline-none w-28"
                    />
                    <button
                      onClick={handleSaveName}
                      className="bg-emerald-500 text-slate-950 px-2 py-0.5 rounded font-bold hover:bg-emerald-400"
                    >
                      OK
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">運転士名:</span>
                    <span className="font-bold text-slate-200">{playerSave.playerName}</span>
                    <button 
                      onClick={() => {
                        setTempName(playerSave.playerName);
                        setIsEditingName(true);
                      }} 
                      className="text-slate-500 hover:text-white p-0.5"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-slate-400">所持ポイント:</span>
                <span className="font-mono text-yellow-300 font-extrabold">{playerSave.credits.toLocaleString()} PT</span>
              </div>
            </div>
          </div>

          {/* フッターとしてのクレジット */}
          <div className="absolute bottom-4 left-0 right-0 text-[10px] text-slate-600 font-mono">
            © 2026 CTC COOPERATIVE TIMETABLE CONTROL. ALL RIGHTS RESERVED.
          </div>
        </div>
      ) : (
        <>
          {/* ヘッダー / ステータスバー */}
          <header className="flex flex-col sm:flex-row justify-between items-center bg-slate-900 border border-slate-800 rounded-xl p-4 mb-6 shadow-md gap-4">
            {/* タイトルとロゴ (戻るボタン追加) */}
            <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
              <button
                onClick={() => {
                  if (step === 'lobby') {
                    setStep('route_select');
                  } else {
                    setStep('intro');
                  }
                }}
                className="bg-slate-950 hover:bg-slate-800 border border-slate-800 py-1.5 px-3 rounded-lg text-xs text-slate-300 font-bold transition flex items-center gap-1 cursor-pointer"
                title={step === 'lobby' ? '路線選択に戻る' : 'タイトル画面に戻る'}
              >
                ← {step === 'lobby' ? '路線選択に戻る' : 'タイトルに戻る'}
              </button>
              <div className="flex items-center gap-2.5">
                <div className="bg-emerald-500 text-slate-950 p-1.5 rounded-lg font-mono font-bold text-base tracking-wider shadow-inner flex items-center gap-1.5">
                  <span className="animate-pulse">●</span> CTC
                </div>
                <div>
                  <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-emerald-400 to-lime-300 bg-clip-text text-transparent">
                    {step === 'route_select' ? '乗務路線選択 (Route Selection)' : '運転車両・機器カスタマイズ'}
                  </h1>
                </div>
              </div>
            </div>

        {/* ユーザーネーム ＆ クレジット */}
        <div className="flex flex-wrap items-center gap-4 justify-end">
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 py-1.5 px-3 rounded-lg text-sm">
            <User className="w-4 h-4 text-emerald-400" />
            {isEditingName ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  maxLength={15}
                  className="bg-slate-800 border border-emerald-500 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none w-24 sm:w-32"
                />
                <button
                  onClick={handleSaveName}
                  className="bg-emerald-500 text-slate-950 text-xs font-bold px-2 py-1 rounded hover:bg-emerald-400"
                >
                  保存
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="font-semibold">{playerSave.playerName}</span>
                <button 
                  onClick={() => {
                    setTempName(playerSave.playerName);
                    setIsEditingName(true);
                  }} 
                  className="text-slate-400 hover:text-white p-0.5 transition"
                  title="名前を編集"
                >
                  <Edit className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-amber-500/30 py-1.5 px-3 rounded-lg text-sm flex items-center gap-1.5">
            <span className="font-mono text-amber-400 font-bold">PT</span>
            <span className="font-mono text-lg font-bold text-yellow-300">
              {playerSave.credits.toLocaleString()}
            </span>
          </div>
        </div>
      </header>

      {/* メインレイアウト */}
      {step === 'route_select' ? (
        <div className="flex flex-col gap-6 w-full max-w-5xl mx-auto py-4 animate-fade-in" id="route-selection-scene">
          <div className="text-center space-y-2 mb-2">
            <h2 className="text-2xl font-black text-white tracking-widest bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
              乗 務 路 線 選 択
            </h2>
            <p className="text-xs text-slate-400 sm:text-sm">
              運行チームと車両を割り当てる路線を選択してください。各路線の特性、制限速度、駅数が異なります。
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {ROUTES.map((route) => {
              const active = selectedRoute.id === route.id;
              
              let difficultyColor = 'text-green-400 bg-green-500/10 border-green-500/20';
              if (route.difficulty === '★★☆') {
                difficultyColor = 'text-orange-400 bg-orange-500/10 border-orange-500/20';
              } else if (route.difficulty === '★★★') {
                difficultyColor = 'text-red-400 bg-red-500/10 border-red-500/20';
              }

              return (
                <div
                  key={route.id}
                  onClick={() => setSelectedRoute(route)}
                  className={`relative rounded-2xl border p-6 flex flex-col justify-between h-[360px] cursor-pointer transition-all duration-300 overflow-hidden group ${
                    active
                      ? 'bg-gradient-to-b from-slate-900 via-slate-900 to-slate-850 border-emerald-500 shadow-2xl shadow-emerald-500/10 ring-1 ring-emerald-500/30'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900 hover:shadow-lg text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className={`absolute top-0 left-0 right-0 h-1.5 transition-all duration-300 ${active ? 'bg-gradient-to-r from-emerald-500 to-teal-400' : 'bg-transparent'}`} />

                  <div className="space-y-4">
                    <div className="flex justify-between items-start gap-2">
                      <h3 className={`font-black text-lg tracking-wide ${active ? 'text-white' : 'text-slate-200'}`}>
                        {route.name}
                      </h3>
                      <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full border shrink-0 ${difficultyColor}`}>
                        {route.difficulty === '★☆☆' ? '初級' : route.difficulty === '★★☆' ? '中級' : '上級'} {route.difficulty}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 leading-relaxed min-h-[50px]">
                      {route.description}
                    </p>

                    <div className="border-t border-slate-800/80 pt-4 space-y-2">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 block">運行駅リスト (Stations Included)</span>
                      <div className="relative pl-3 border-l-2 border-slate-805 py-1 space-y-3">
                        {route.stations.map((station, sIdx) => {
                          const isFirst = sIdx === 0;
                          const isLast = sIdx === route.stations.length - 1;
                          return (
                            <div key={station.name} className="flex items-center gap-1.5 text-[11px] relative">
                              <div className={`absolute -left-[17px] w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${
                                isFirst ? 'bg-emerald-500' : isLast ? 'bg-red-500' : 'bg-blue-400'
                              }`} />
                              <span className={`font-bold ${active ? 'text-slate-300' : 'text-slate-400'} truncate`}>
                                {station.name}
                              </span>
                              {station.speedLimit > 0 && (
                                <span className="text-[9px] text-amber-500 font-mono scale-90 bg-amber-500/5 px-1 rounded ml-1">
                                  {station.speedLimit}km/h制限
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-800/60 pt-3 flex justify-between items-center text-xs font-mono mt-4">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-500">総駅数</span>
                      <span className={`font-bold ${active ? 'text-white' : 'text-slate-300'}`}>{route.stations.length} 駅</span>
                    </div>
                    <div className="flex flex-col text-right">
                      <span className="text-[10px] text-slate-500">営業キロ</span>
                      <span className={`font-bold ${active ? 'text-white' : 'text-slate-300'}`}>{(route.totalDistance / 1000).toFixed(1)} km</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-8 flex flex-col items-center gap-3">
            <button
              onClick={() => {
                setStep('lobby');
              }}
              className="w-full max-w-md bg-gradient-to-r from-emerald-500 to-lime-500 text-slate-950 hover:from-emerald-400 hover:to-lime-400 font-extrabold py-4 px-8 rounded-xl text-md shadow-xl shadow-emerald-500/10 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2.5 group font-sans"
            >
              <span>この路線で決定し、車両選択へ進む</span>
              <span className="group-hover:translate-x-1 transition-transform">➔</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-grow" id="lobby-selection-scene">
          {/* 左カラム (8/12) - 車両 ＆ 決定した路線 */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            {/* 1. 車両選択セクション */}
            <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2.5">
                <h2 className="font-bold text-base flex items-center gap-2 text-emerald-400">
                  <Zap className="w-5 h-5 text-emerald-400 animate-pulse" />
                  車両の選択
                </h2>
                <span className="text-xs text-slate-400 font-mono">Select & Tune Up Your Unit</span>
              </div>

              {/* 車両タブ選択 */}
              <div className="grid grid-cols-3 gap-2 sm:gap-4">
                {(Object.keys(TRAIN_TEMPLATES) as TrainType[]).map((type) => {
                  const spec = TRAIN_TEMPLATES[type];
                  const active = selectedTrain === type;
                  return (
                    <button
                      key={type}
                      onClick={() => setSelectedTrain(type)}
                      className={`relative overflow-hidden py-3 px-2 sm:px-4 rounded-xl text-center border transition duration-200 flex flex-col items-center gap-1 cursor-pointer ${
                        active
                          ? 'bg-slate-800 border-emerald-500 text-white shadow-md shadow-emerald-500/5'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-white'
                      }`}
                    >
                      <span 
                        className="absolute top-0 left-0 right-0 h-1.5" 
                        style={{ backgroundColor: spec.color }}
                      />
                      <span className="font-mono text-lg font-bold tracking-wider mt-1">{type}系</span>
                      <span className="text-[10px] hidden sm:inline opacity-75 truncate max-w-full">
                        {type === 'E231' ? '通勤型スタンダード' : type === 'E233' ? '高加速・快速型' : '次世代ブレーキ'}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* 車両詳細 & カスタム状況 */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 grid grid-cols-1 md:grid-cols-12 gap-4">
                {/* 車両のビジュアル(2Dアイコン)と説明文 */}
                <div className="md:col-span-5 flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="text-lg font-bold text-white">{currentSpecs.name}</span>
                      <span 
                        className="text-[10px] font-bold px-2 py-0.5 rounded text-slate-950 font-mono"
                        style={{ backgroundColor: currentSpecs.color }}
                      >
                        JR EAST TYPE
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed md:max-h-24 overflow-y-auto">
                      {currentSpecs.description}
                    </p>
                  </div>

                  {/* チューニング画面へ進む */}
                  <button
                    onClick={() => onOpenCustomize(selectedTrain)}
                    className="bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-emerald-500 text-slate-200 hover:text-emerald-400 text-xs font-bold py-2.5 px-4 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    <Settings2 className="w-4 h-4" />
                    <span>この車両をカスタマイズする</span>
                  </button>
                </div>

                {/* 実効パラメーター表示 */}
                <div className="md:col-span-7 flex flex-col gap-3.5 border-t md:border-t-0 md:border-l border-slate-800 pt-3 md:pt-0 md:pl-4">
                  <span className="text-xs font-bold text-emerald-400 font-mono">CUSTOM TUNER STATE (Lv.1 - 5)</span>
                  
                  {/* 最高速度 */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <Gauge className="w-3.5 h-3.5 text-blue-400" />
                        主電動機 (最高速度)
                      </span>
                      <span className="text-white font-bold">
                        {calculated.maxSpeed} <span className="text-[10px] text-slate-500">km/h</span>
                        <span className="text-emerald-400 ml-1.5">(Lv.{customState.motor})</span>
                      </span>
                    </div>
                    <div className="h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800/80">
                      <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${maxSpeedPercent}%` }} />
                    </div>
                  </div>

                  {/* 起動加速度 */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-amber-400" />
                        VVVFインバータ (加速度)
                      </span>
                      <span className="text-white font-bold">
                        {calculated.acceleration.toFixed(1)} <span className="text-[10px] text-slate-500">km/h/s</span>
                        <span className="text-emerald-400 ml-1.5">(Lv.{customState.vvvf})</span>
                      </span>
                    </div>
                    <div className="h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800/80">
                      <div className="h-full bg-amber-500 rounded-full transition-all duration-300" style={{ width: `${accelPercent}%` }} />
                    </div>
                  </div>

                  {/* ブレーキ減速度 */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
                        制動装置 (ブレーキ)
                      </span>
                      <span className="text-white font-bold">
                        {calculated.deceleration.toFixed(1)} <span className="text-[10px] text-slate-500">km/h/s</span>
                        <span className="text-emerald-400 ml-1.5">(Lv.{customState.brake})</span>
                      </span>
                    </div>
                    <div className="h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800/80">
                      <div className="h-full bg-red-500 rounded-full transition-all duration-300" style={{ width: `${decelPercent}%` }} />
                    </div>
                  </div>

                  {/* ATS / 停車支援 */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <HelpCircle className="w-3.5 h-3.5 text-purple-400" />
                        停車支援 / 空転抑制
                      </span>
                      <span className="text-white font-bold">
                        {calculated.atsAssistLevel === 1 ? '標準' : calculated.atsAssistLevel === 5 ? '極(全支援)' : `アシスト Lv.${calculated.atsAssistLevel}`}
                        <span className="text-emerald-400 ml-1.5">(Lv.{customState.ats})</span>
                      </span>
                    </div>
                    <div className="h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800/80">
                      <div className="h-full bg-purple-500 rounded-full transition-all duration-300" style={{ width: `${atsPercent}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* 3. 乗務登録・運行開始（確定パネル） */}
            <div className="bg-gradient-to-br from-slate-904 via-slate-900 to-slate-850 border border-emerald-500/40 rounded-xl p-5 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="space-y-1.5 text-center sm:text-left">
                <span className="text-[10px] text-emerald-400 font-mono font-black uppercase tracking-widest block bg-emerald-500/10 px-2.5 py-0.5 rounded-full w-max mx-auto sm:ml-0">
                  SCHEDULED STAGE
                </span>
                <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-start pt-1">
                  <span className="text-lg font-black text-white">{selectedRoute.name}</span>
                  <span className="text-xs bg-slate-800 text-slate-300 font-bold px-2 py-0.5 rounded">
                    {selectedRoute.difficulty}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    {(selectedRoute.totalDistance / 1000).toFixed(1)}km / {selectedRoute.stations.length}駅
                  </span>
                </div>
                <p className="text-xs text-slate-450 max-w-xl">
                  {selectedRoute.description}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto shrink-0 pt-2 sm:pt-0">
                <button
                  onClick={() => setStep('route_select')}
                  className="bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-bold py-3.5 px-5 rounded-xl transition cursor-pointer"
                >
                  ← 路線を変更
                </button>

                <button
                  onClick={() => onStartGame(selectedRoute, selectedTrain)}
                  className="bg-gradient-to-r from-emerald-500 to-lime-500 hover:from-emerald-400 hover:to-lime-400 text-slate-950 font-black py-3.5 px-8 rounded-xl text-md shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2 flex-1 sm:flex-initial"
                >
                  <Play className="w-5 h-5 fill-slate-950 animate-pulse" />
                  <span>運 行 開 始 ! (GO)</span>
                </button>
              </div>
            </div>
          </div>

        {/* 右カラム (4/12) - ランキング ＆ システム情報 */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          {/* ランキングセクション */}
          <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex-grow flex flex-col min-h-[350px]">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2.5 mb-4">
              <h2 className="font-bold text-base flex items-center gap-2 text-yellow-400">
                <Trophy className="w-5 h-5" />
                {selectedRoute.name.split('タ')[0]} 全国ランキング
              </h2>
              <button 
                onClick={fetchRankings}
                className="text-slate-400 hover:text-white transition p-1 rounded hover:bg-slate-800"
                title="ランキング更新"
                disabled={loadingLeaderboard}
              >
                <RefreshCw className={`w-4 h-4 ${loadingLeaderboard ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* ランキング表示リスト */}
            <div className="flex-grow flex flex-col justify-start overflow-y-auto max-h-[420px] pr-1 scrollbar-thin scrollbar-thumb-slate-850">
              {loadingLeaderboard ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-400">
                  <RefreshCw className="w-8 h-8 animate-spin text-emerald-500" />
                  <span className="text-xs font-mono">CTC通信電波 受信中...</span>
                </div>
              ) : leaderboard.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500 text-xs text-center border border-dashed border-slate-800 rounded-xl p-4">
                  <p>ランキングデータがありません。</p>
                  <p className="mt-1 mt-1 font-mono">最初の記録を達成しましょう！</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {leaderboard.map((item, index) => {
                    const isTop3 = index < 3;
                    const badgeColor = index === 0 ? 'bg-amber-400 text-slate-950 font-bold' 
                                     : index === 1 ? 'bg-slate-300 text-slate-950' 
                                     : index === 2 ? 'bg-amber-600 text-white' 
                                     : 'text-slate-400';
                    const activePlayer = item.name === playerSave.playerName;

                    return (
                      <div
                        key={item.id}
                        className={`text-xs flex items-center justify-between p-2 rounded-lg border transition ${
                          activePlayer 
                            ? 'bg-emerald-950/30 border-emerald-500/80 text-white' 
                            : 'bg-slate-950/70 border-slate-850 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {/* 順位バッジ */}
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center font-mono shrink-0 flex-col font-bold ${isTop3 ? badgeColor : 'bg-slate-900 border border-slate-800 text-slate-500 text-[10px]'}`}>
                            {index + 1}
                          </div>

                          <div className="truncate min-w-0">
                            <span className={`font-semibold block ${activePlayer ? 'text-emerald-400' : 'text-slate-200'} truncate`}>
                              {item.name}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                              <span 
                                className="w-1.5 h-1.5 rounded-full inline-block" 
                                style={{ backgroundColor: TRAIN_TEMPLATES[item.trainType]?.color || '#fff' }}
                              />
                              {item.trainType}系 | カスタム有
                            </span>
                          </div>
                        </div>

                        {/* 得点タイム */}
                        <div className="text-right font-mono self-center pl-2 shrink-0">
                          <span className="text-yellow-400 font-bold text-sm">
                            {item.totalScoreTime.toFixed(2)}
                          </span>
                          <span className="text-[9px] text-slate-500 ml-0.5">秒</span>

                          {item.penaltyTime > 0 && (
                            <span className="block text-[8px] text-red-400">
                              (内ペナ+{item.penaltyTime.toFixed(1)}s)
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* オンライン vs ローカルステータス */}
            <div className="mt-4 border-t border-slate-800 pt-3 flex items-center justify-between text-[11px] text-slate-400 font-mono">
              <span className="flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5" />
                サーバー連携:
              </span>
              {fbStatus.active ? (
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                  ONLINE (Firestore)
                </span>
              ) : (
                <span className="text-amber-500 font-bold" title="You can play locally with localStorage">
                  LOCAL DEV MODE
                </span>
              )}
            </div>
          </section>

          {/* 操作説明カード */}
          <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg text-xs space-y-3.5">
            <h3 className="font-bold text-slate-300 border-b border-slate-800 pb-1.5 flex items-center gap-1.5">
              <span>🔰 基本運転ガイド / ルール</span>
            </h3>
            
            <ul className="space-y-2 text-slate-400 leading-relaxed list-disc list-inside">
              <li>
                <strong className="text-slate-200">運転方法</strong>: ノッチ(加速)1〜5と、ブレーキ1〜8（非常含む）をマウスや矢印キー、またはボタンで切り替えます。
              </li>
              <li>
                <strong className="text-slate-200">制限速度(ATC)</strong>: 運転中、速度制限指示が出ます。超過すると<span className="text-red-400 font-bold">即時強制ブレーキがかかり数秒のタイムロス！</span>
              </li>
              <li>
                <strong className="text-slate-200">駅停車アクション</strong>: 各駅の停止位置マーク(0.0m)に電車を合わせます。ずれるとオーバーラン(または手前停車)ペナルティがタイムに追加されます。
              </li>
              <li>
                <strong className="text-slate-200">ポイント獲得</strong>: タイムアタックを完走すると、停車精度や走行タイムに応じて<strong className="text-yellow-400">パーツ強化用のポイント(PT)</strong>を入手。最強のモンスター車両を作り上げよう！
              </li>
            </ul>
          </section>
        </div>
      </div>
      )}
        </>
      )}
    </div>
  );
}
