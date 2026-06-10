import { useState, useEffect } from 'react';
import TitleScreen from './components/TitleScreen';
import CustomizeScreen from './components/CustomizeScreen';
import GameScreen from './components/GameScreen';
import ResultScreen from './components/ResultScreen';
import { Route, TrainType, PlayerSave } from './types';
import { loadSaveData, saveSaveData } from './db';
import { RefreshCw } from 'lucide-react';

export default function App() {
  const [playerSave, setPlayerSave] = useState<PlayerSave | null>(null);
  const [currentScreen, setCurrentScreen] = useState<'title' | 'customize' | 'game' | 'result'>('title');
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [selectedTrain, setSelectedTrain] = useState<TrainType>('E235');
  
  // 走行時間・ペナルティの一時記録
  const [finalTime, setFinalTime] = useState<number>(0);
  const [penaltyTime, setPenaltyTime] = useState<number>(0);

  // 初回マウント時にセーブデータをlocalStorageからロード
  useEffect(() => {
    setPlayerSave(loadSaveData());
  }, []);

  const handleUpdateSave = (newSave: PlayerSave) => {
    setPlayerSave(newSave);
    saveSaveData(newSave);
  };

  const handleStartGame = (route: Route, trainType: TrainType) => {
    setSelectedRoute(route);
    setSelectedTrain(trainType);
    setCurrentScreen('game');
  };

  const handleFinishGame = (time: number, penalty: number) => {
    setFinalTime(time);
    setPenaltyTime(penalty);
    setCurrentScreen('result');
  };

  const handleOpenCustomize = (trainType: TrainType) => {
    setSelectedTrain(trainType);
    setCurrentScreen('customize');
  };

  if (!playerSave) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-100">
        <RefreshCw className="w-8 h-8 animate-spin text-emerald-500 mb-2" />
        <span className="text-xs font-mono">セーブデータを読み込み中...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 transition duration-300">
      {currentScreen === 'title' && (
        <TitleScreen
          playerSave={playerSave}
          onUpdateSave={handleUpdateSave}
          onStartGame={handleStartGame}
          onOpenCustomize={handleOpenCustomize}
        />
      )}

      {currentScreen === 'customize' && (
        <CustomizeScreen
          playerSave={playerSave}
          selectedTrainType={selectedTrain}
          onUpdateSave={handleUpdateSave}
          onClose={() => setCurrentScreen('title')}
        />
      )}

      {currentScreen === 'game' && selectedRoute && (
        <GameScreen
          route={selectedRoute}
          trainType={selectedTrain}
          playerSave={playerSave}
          onCancel={() => setCurrentScreen('title')}
          onFinishTimeAttack={handleFinishGame}
        />
      )}

      {currentScreen === 'result' && selectedRoute && (
        <ResultScreen
          route={selectedRoute}
          trainType={selectedTrain}
          finalTime={finalTime}
          penaltyTime={penaltyTime}
          playerSave={playerSave}
          onUpdateSave={handleUpdateSave}
          onReset={() => setCurrentScreen('title')}
        />
      )}
    </div>
  );
}
