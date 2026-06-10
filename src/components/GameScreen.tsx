import { useState, useEffect, useRef } from 'react';
import { 
  Route, 
  TrainType, 
  TRAIN_TEMPLATES, 
  PlayerSave, 
  SPEED_LIMITS, 
  SpeedLimitZone 
} from '../types';
import { calculateTrainSpecs } from '../utils/physics';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Gauge, 
  AlertTriangle, 
  Timer, 
  MapPin, 
  ChevronRight, 
  Thermometer, 
  Zap,
  Volume2,
  VolumeX,
  Footprints
} from 'lucide-react';

interface GameScreenProps {
  route: Route;
  trainType: TrainType;
  playerSave: PlayerSave;
  onFinishTimeAttack: (finalTime: number, totalPenalty: number) => void;
  onCancel: () => void;
}

// 物理キーとノッチの割り当て
// 0: N (Neutral)
// 1..5: P1..P5 (Power/Throttle)
// -1..-8: B1..B8 (Normal Braking)
// -9: EB (Emergency Brake)
export default function GameScreen({
  route,
  trainType,
  playerSave,
  onFinishTimeAttack,
  onCancel
}: GameScreenProps) {
  // 物理性能の決定
  const baseSpecs = TRAIN_TEMPLATES[trainType];
  const customState = playerSave.customs[trainType];
  const specs = calculateTrainSpecs(baseSpecs, customState);

  // --- ゲームの状態 ---
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStationIdx, setCurrentStationIdx] = useState(0);
  
  // リアルタイム変数（UIに渡すステート。再レンダリング頻度は制御したいが、シミュレーション値はRefで保持し、定期的に更新・レンダリング）
  const [speed, setSpeed] = useState(0); // km/h
  const [distance, setDistance] = useState(0); // 現在の絶対距離 (メートル)
  const [notch, setNotch] = useState(0); // -9..5
  const [isEmergencyBrake, setIsEmergencyBrake] = useState(false);
  const [isATCWarning, setIsATCWarning] = useState(false);
  const [isSlipping, setIsSlipping] = useState(false);
  const [isDoorOpen, setIsDoorOpen] = useState(false);
  const [doorProgress, setDoorProgress] = useState(0); // 0 to 100%
  const [elapsedTime, setElapsedTime] = useState(0); // 走行時間 (秒)
  const [accumulatedPenalty, setAccumulatedPenalty] = useState(0); // ペナルティ時間 (秒)
  const [isAtsAssisted, setIsAtsAssisted] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // 天気状態: 湘南新宿ラインや特定の状況で雨になるとスリップしやすい
  const [isRaining, setIsRaining] = useState(route.id === 'shonan' && Math.random() > 0.4);

  // 停車通知のログ
  const [logs, setLogs] = useState<string[]>(['マスコンを上げて、出発進行！']);

  // 駅ごとの停車完了記録
  // 各駅に一度だけ停車判定を行うためのフラグ、および停車誤差
  const [stopResults, setStopResults] = useState<{ name: string; error: number; penalty: number }[]>([]);

  // 非常ブレーキ強制ロック
  const [forcedBrakeUntil, setForcedBrakeUntil] = useState<number | null>(null);

  // 目的地情報
  const stations = route.stations;
  const currentStation = stations[currentStationIdx];
  const isFinalStation = currentStationIdx === stations.length - 1;

  // --- シミュレーション物理用のRef (一貫した60FPSループのため) ---
  const stateRef = useRef({
    isPlaying: false,
    speed: 0, // km/h
    distance: 0, // m
    notch: 0, // -9..5 (P5..EB)
    elapsedTime: 0, // s
    penaltyTime: 0, // s
    isDoorOpen: false,
    doorTimer: 0, // ms
    isCompleting: false,
    stationIndex: 0,
    forcedBrakeTimer: 0, // 制限速度超過時の非常ペナルティタイマー
    slipRecoveryTimer: 0,
    slipProbability: 0,
    isSlipping: false,
  });

  // 音声効果 (Web Audio API を使って動的合成モータ・VVVF音 ＆ ブザー音)
  const audioCtxRef = useRef<AudioContext | null>(null);
  const motorOscRef = useRef<OscillatorNode | null>(null);
  const motorGainRef = useRef<GainNode | null>(null);
  const vvvfOscRef = useRef<OscillatorNode | null>(null);
  const vvvfGainRef = useRef<GainNode | null>(null);

  // 音声の初期化
  const initAudio = () => {
    if (audioCtxRef.current) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      audioCtxRef.current = ctx;

      // モーター音 oscillator
      const oscMotor = ctx.createOscillator();
      oscMotor.type = 'sawtooth';
      oscMotor.frequency.setValueAtTime(40, ctx.currentTime);

      const gainMotor = ctx.createGain();
      gainMotor.gain.setValueAtTime(0, ctx.currentTime);

      oscMotor.connect(gainMotor);
      gainMotor.connect(ctx.destination);
      oscMotor.start();

      motorOscRef.current = oscMotor;
      motorGainRef.current = gainMotor;

      // VVVFインバーターキャリア音
      const oscVvvf = ctx.createOscillator();
      oscVvvf.type = 'sine';
      oscVvvf.frequency.setValueAtTime(200, ctx.currentTime); // 初期キーン音

      const gainVvvf = ctx.createGain();
      gainVvvf.gain.setValueAtTime(0, ctx.currentTime);

      oscVvvf.connect(gainVvvf);
      gainVvvf.connect(ctx.destination);
      oscVvvf.start();

      vvvfOscRef.current = oscVvvf;
      vvvfGainRef.current = gainVvvf;
    } catch (e) {
      console.warn("Audio Context init blocked or not supported:", e);
    }
  };

  // ビープ電子音
  const playBeep = (freq: number, duration: number) => {
    if (!soundEnabled || !audioCtxRef.current) return;
    try {
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {}
  };

  // ドア開閉音
  const playDoorChime = () => {
    playBeep(880, 0.15);
    setTimeout(() => playBeep(880, 0.15), 200);
    setTimeout(() => playBeep(880, 0.15), 400);
  };

  // モーター・インバーター音の速度とノッチに連動したリアルタイム更新
  const updateAudioSynthesizer = (currentSpeed: number, currentNotch: number, isEB: boolean) => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    
    const gMotor = motorGainRef.current;
    const oMotor = motorOscRef.current;
    const gVvvf = vvvfGainRef.current;
    const oVvvf = vvvfOscRef.current;

    // ポーズ中やミュート時は即座に音量をカットする
    if (!soundEnabled || !isPlaying) {
      if (gMotor) gMotor.gain.value = 0;
      if (gVvvf) gVvvf.gain.value = 0;
      return;
    }

    if (ctx.state === 'suspended') return;
    if (!gMotor || !oMotor || !gVvvf || !oVvvf) return;

    if (currentSpeed < 1 && currentNotch === 0) {
      gMotor.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      gVvvf.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      return;
    }

    // 1. VVVF励磁音 (キーンという変調音、発車時のみ聞こえ、速度40/kmh以上で消失)
    if (currentSpeed < 45) {
      const vvvfVol = currentNotch > 0 ? 0.08 : currentNotch < 0 ? 0.05 : 0.01;
      gVvvf.gain.setTargetAtTime(vvvfVol, ctx.currentTime, 0.05);

      // E233系: 高めの周波数 ➔ E235系さらに滑らか
      let baseFreq = 400;
      if (trainType === 'E233') baseFreq = 650;
      if (trainType === 'E235') baseFreq = 950;

      // 速度に応じてドレミファの様に変調をシミュレート
      let f = baseFreq;
      if (currentSpeed < 10) {
        f = baseFreq + currentSpeed * 40;
      } else if (currentSpeed < 25) {
        f = (baseFreq / 1.5) + (currentSpeed - 10) * 80;
      } else {
        f = 1200 - (currentSpeed - 25) * 30;
      }
      oVvvf.frequency.setValueAtTime(f, ctx.currentTime);
    } else {
      gVvvf.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
    }

    // 2. 主電動機音 ＆ 走行風切り音 (ブーンという音、速度に比例して周波数と音量がアップ)
    if (currentSpeed > 0.5) {
      const targetVol = 0.03 + (currentSpeed / 120) * 0.05 + (Math.abs(currentNotch) / 9) * 0.02;
      gMotor.gain.setTargetAtTime(targetVol, ctx.currentTime, 0.1);

      // モーターギヤピッチ: E231は唸り、E235は静か
      const pitchMultiplier = trainType === 'E231' ? 2.5 : trainType === 'E233' ? 2.0 : 1.5;
      const targetFreq = 20 + currentSpeed * pitchMultiplier;
      oMotor.frequency.setValueAtTime(targetFreq, ctx.currentTime);
    } else {
      gMotor.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    }
  };

  // --- 制限速度の定義取得 ---
  const limits = SPEED_LIMITS[route.id] || [];

  const getActiveLimit = (pos: number): number => {
    // 駅の制限速度 (終点など直前は 0 ではないが最後の駅停車ターゲット)
    // 常に動的に、現在位置が含まれる SpeedLimitZone を探索
    const activeZone = limits.find(z => pos >= z.start && pos <= z.end);
    if (activeZone) {
      return activeZone.limit;
    }
    // 駅前 70m 付近は自動的に 60km/h 等への徐行をマナー/ATCに
    for (let i = 0; i < stations.length; i++) {
      const s = stations[i];
      const distToSt = s.distance - pos;
      if (distToSt > 0 && distToSt < 120) {
        return Math.min(s.speedLimit, 55); // 駅手前は55制限
      }
    }
    return 110; // デフォルト上限なし (110km/h)
  };

  // --- ゲームループの実装 ---
  useEffect(() => {
    stateRef.current.isPlaying = isPlaying;
    if (!isPlaying) {
      if (motorGainRef.current) motorGainRef.current.gain.value = 0;
      if (vvvfGainRef.current) vvvfGainRef.current.gain.value = 0;
      if (audioCtxRef.current && audioCtxRef.current.state === 'running') {
        audioCtxRef.current.suspend();
      }
      return;
    }

    initAudio();
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }

    let lastTime = performance.now();
    let frameId: number;

    const loop = (now: number) => {
      // 経過時間 delta (s)
      const dt = Math.min((now - lastTime) / 1000, 0.1); // 最低10fps
      lastTime = now;

      const state = stateRef.current;

      // 1. ドア客扱い中の処理 (ドアが開いている間は、発車できない)
      if (state.isDoorOpen) {
        state.doorTimer += dt * 1000;
        const progress = Math.min((state.doorTimer / 2500) * 100, 100);
        setDoorProgress(progress);

        if (state.doorTimer >= 2500) {
          // ドア閉まる
          state.isDoorOpen = false;
          setIsDoorOpen(false);
          setDoorProgress(0);
          state.doorTimer = 0;
          
          playDoorChime(); // 発車催促チャイム

          // 次の駅を設定
          if (state.stationIndex < stations.length - 1) {
            state.stationIndex += 1;
            setCurrentStationIdx(state.stationIndex);
            
            // ドア閉完了後にログ
            setLogs(prev => [
              `▲ 戸閉。出発進行！次の駅: ${stations[state.stationIndex].name}`,
              ...prev.slice(0, 4)
            ]);
          }
        }
        
        // 速度は当然0に強制
        state.speed = 0;
        setSpeed(0);

        frameId = requestAnimationFrame(loop);
        return;
      }

      // 2. 時間カウント
      state.elapsedTime += dt;
      setElapsedTime(state.elapsedTime);

      // --- 速度制御・物理 ---
      let targetAccel = 0;

      // 現在位置における徐行制限速度
      const speedLimit = getActiveLimit(state.distance);

      // 速度超過の強制非常ブレーキ中かどうか
      if (state.forcedBrakeTimer > 0) {
        state.forcedBrakeTimer -= dt * 1000;
        // 非常ブレーキ(-9)を強制
        state.notch = -9;
        setNotch(-9);
        setIsEmergencyBrake(true);

        // ペナルティタイム加算 (毎秒0.5秒分タイムを悪化)
        state.penaltyTime += dt * 0.5;
        setAccumulatedPenalty(state.penaltyTime);

        if (state.forcedBrakeTimer <= 0) {
          state.forcedBrakeTimer = 0;
          setIsEmergencyBrake(false);
          setIsATCWarning(false);
          setLogs(prev => [`非常ブレーキ解除。運転再開してください。`, ...prev.slice(0, 4)]);
        }
      } else {
        // 通常運転
        // もし突然速度超過（制限速度オーバー）した場合、強制ATSブレーキ作動
        if (state.speed > speedLimit + 2 && state.speed > 5) {
          playBeep(1200, 0.5);
          state.forcedBrakeTimer = 3000; // 3秒間の強制EBロック
          state.notch = -9;
          setNotch(-9);
          setIsATCWarning(true);
          
          // ペナルティ2秒即加算
          state.penaltyTime += 2.0;
          setAccumulatedPenalty(state.penaltyTime);

          setLogs(prev => [
            `🚨 速度超過(ATC検知)! 制限:${speedLimit}km/hに対し現在${state.speed.toFixed(0)}km/h。3秒間非常制動！`,
            ...prev.slice(0, 4)
          ]);
        }
      }

      // 加速・減速変化
      if (state.notch > 0) {
        // パワー加速
        // E233、E235では加速が違う
        const powerRatio = state.notch / 5;
        const accelPower = specs.acceleration * powerRatio;

        // 雨の日は空転しやすい (空転フラグ判定)
        let isPowerSlipping = false;
        if (isRaining && state.notch >= 4 && state.speed < 45) {
          // ATSレベルが高いほど、空転しにくくなる
          const slipThreshold = 0.05 + (specs.atsAssistLevel * 0.08); // 空転を防ぐ閾値
          state.slipProbability += dt;
          if (state.slipProbability > 0.4 && Math.random() > slipThreshold) {
            state.isSlipping = true;
            setIsSlipping(true);
            state.slipRecoveryTimer = 1500; // 1.5s 空転
          }
        }

        if (state.isSlipping) {
          state.slipRecoveryTimer -= dt * 1000;
          // トラクション激減
          targetAccel = accelPower * 0.15;
          if (state.slipRecoveryTimer <= 0) {
            state.isSlipping = false;
            setIsSlipping(false);
            state.slipProbability = 0;
          }
        } else {
          // 高速になると空気抵抗・モータ特性により加速力が徐々に低下する設計
          const motorEfficiency = Math.max(0.1, 1 - (state.speed / specs.maxSpeed));
          targetAccel = accelPower * motorEfficiency;
        }

      } else if (state.notch < 0) {
        // ブレーキ減速
        if (state.notch === -9) {
          // 非常
          targetAccel = -specs.deceleration * 1.5;
        } else {
          const brakeRatio = Math.abs(state.notch) / 8;
          targetAccel = -specs.deceleration * brakeRatio;
        }
      } else {
        // ニュートラル: コロガリ(惰行)。自然な転がり摩擦と空気抵抗
        targetAccel = -0.05 - (state.speed * 0.005);
      }

      // 速度算出 ($v_{new} = v_{old} + a \times dt$) - km/h
      // 加速度は km/h/s 単位で定義しているのでそのまま dt (s) をかける
      state.speed += targetAccel * dt;

      // 最高速制限
      if (state.notch > 0 && state.speed > specs.maxSpeed) {
        state.speed = specs.maxSpeed;
      }
      
      // 0以下
      if (state.speed < 0) {
        state.speed = 0;
      }

      // --- 位置移動 ---
      // 速度 km/h から m/s に換算: 1 km/h = 1/3.6 m/s
      const speedInMps = state.speed / 3.6;
      state.distance += speedInMps * dt;
      setDistance(state.distance);
      setSpeed(state.speed);

      // --- 駅の停止線判定 ---
      // 対象駅の停止線(メートル)
      const stationDistance = currentStation.distance;
      const distanceToStation = stationDistance - state.distance; // 停止線までの残り距離(m)

      // ATS停止アシスト。ATSレベル3以上なら、停止線1m手前かつ超微速の場合にビタッと止まりやすくする
      let assistActive = false;
      if (specs.atsAssistLevel >= 3 && Math.abs(distanceToStation) < 1.0 && state.speed < 4.0 && state.speed > 0.05 && state.notch < 0) {
        assistActive = true;
        // スピードを一気に下げて強制的にピタッと停止位置で止める
        state.speed = Math.max(0, state.speed - 3.5 * dt);
        if (state.speed < 0.2) {
          state.speed = 0;
        }
      }
      setIsAtsAssisted(assistActive);

      // 車両が完全に停止し、かつまだその駅での客扱い(ドア開き)をしていない場合
      if (state.speed === 0 && Math.abs(distanceToStation) < 60) {
        // 駅の停車圏内 (手前または越えて60m以内) に停止。停車判定へ！
        const error = Number(distanceToStation.toFixed(2)); // + は手前、- はオーバーラン
        const absoluteError = Math.abs(error);

        // ペナルティタイム算出:
        // 0.3m以内: ノーペナ (神停車！)
        // 0.3m 〜 1.5m: ペナルティ +0.5秒
        // 1.5m 〜 i.e. 1mにつき0.5秒ペナ
        let penalty = 0;
        let grade = '';
        if (absoluteError <= 0.3) {
          penalty = 0;
          grade = 'Great! (合格線)';
        } else if (absoluteError <= 1.5) {
          penalty = 0.5;
          grade = 'Good';
        } else {
          penalty = Number((absoluteError * 0.4).toFixed(1));
          grade = absoluteError > 10 ? '🚨 大オーバーラン/過剰手前' : 'Bad';
        }

        // ペナルティ累積
        state.penaltyTime += penalty;
        setAccumulatedPenalty(state.penaltyTime);

        // 結果記録
        const thisStopResult = { name: currentStation.name, error: error, penalty };
        setStopResults(prev => [...prev, thisStopResult]);

        // 駅停車メッセージビープ
        playBeep(650, 0.45);

        // ログ追加
        setLogs(prev => [
          `🚉 ${currentStation.name} に停車しました。誤差: ${error > 0 ? '手前' : 'オーバー'}${absoluteError.toFixed(2)}m (${grade}) / タイムペナルティ: +${penalty}秒`,
          ...prev.slice(0, 4)
        ]);

        // ドアを開く
        state.isDoorOpen = true;
        setIsDoorOpen(true);
        state.doorTimer = 0;

        // ノッチをニュートラルかブレーキ側に戻す
        state.notch = -4; // N1程度にする（転がり防止）
        setNotch(-4);

        // もし最終目的地(終点)の場合、タイムアタックの終了
        if (isFinalStation) {
          state.isPlaying = false;
          setIsPlaying(false);
          // タイムアタック最終結果画面へ
          setTimeout(() => {
            onFinishTimeAttack(state.elapsedTime, state.penaltyTime);
          }, 1500);
          return;
        }
      }

      // もし駅を大幅に超過(60m以上オーバーラン)して、駅構内ですらなく停止もしなかった場合
      if (distanceToStation < -60 && !isFinalStation) {
        // 通過ペナルティ (手痛い5秒ペナルティ) を受けて、強制的に次の駅ターゲットにスキップ
        state.penaltyTime += 6.0;
        setAccumulatedPenalty(state.penaltyTime);
        playBeep(350, 0.6);

        setLogs(prev => [
          `🚨 ${currentStation.name} 駅を完全通過(スルー)！ 罰則タイム+6.0秒加算、強制的に次の閉塞区間へ。`,
          ...prev.slice(0, 4)
        ]);

        // 次の駅へ
        state.stationIndex += 1;
        setCurrentStationIdx(state.stationIndex);
      }

      // 音声更新
      updateAudioSynthesizer(state.speed, state.notch, state.notch === -9);

      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying, currentStationIdx, soundEnabled]);

  // コンポーネントのアンマウント（棄権時等）に音声を完全に停止する
  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        try {
          if (motorGainRef.current) motorGainRef.current.gain.value = 0;
          if (vvvfGainRef.current) vvvfGainRef.current.gain.value = 0;
          if (motorOscRef.current) {
            try { motorOscRef.current.stop(); } catch (e) {}
          }
          if (vvvfOscRef.current) {
            try { vvvfOscRef.current.stop(); } catch (e) {}
          }
          audioCtxRef.current.close().catch(() => {});
        } catch (e) {
          console.warn("Error cleaning up audio on unmount:", e);
        }
        audioCtxRef.current = null;
      }
    };
  }, []);

  // キーボードイベントの登録
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPlaying || stateRef.current.isDoorOpen) return;
      const key = e.key.toLowerCase();

      // 上矢印 or W: 加速 (ノッチを上げる / ブレーキを解除)
      if (key === 'arrowup' || key === 'w') {
        const state = stateRef.current;
        let nextNotch = state.notch;
        if (nextNotch === -9) {
          // 非常ブレーキから通常ブレーキへ
          nextNotch = -8;
        } else if (nextNotch < 5) {
          nextNotch += 1;
        }
        state.notch = nextNotch;
        setNotch(nextNotch);
        playBeep(920, 0.05);
      }

      // 下矢印 or S: 減速 (パワーを切る / ブレーキをかける)
      if (key === 'arrowdown' || key === 's') {
        const state = stateRef.current;
        let nextNotch = state.notch;
        if (nextNotch > -8) {
          nextNotch -= 1;
        } else if (nextNotch === -8) {
          // B8からさらに下げて非常ブレーキ(EB)へ
          nextNotch = -9;
        }
        state.notch = nextNotch;
        setNotch(nextNotch);
        playBeep(440, 0.05);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying]);

  const handleStartStop = () => {
    const nextPlay = !isPlaying;
    setIsPlaying(nextPlay);
    setLogs(prev => [nextPlay ? "▶ 朝ラッシュダイヤ、運転開始！" : "⏸ 運転を一時停止しました。", ...prev.slice(0, 4)]);
  };

  const setNotchTo = (target: number) => {
    if (stateRef.current.isDoorOpen || !isPlaying) return;
    stateRef.current.notch = target;
    setNotch(target);
    playBeep(target > 0 ? 800 + target * 20 : 500 + target * 15, 0.06);
  };

  // 速度制限リストのビジュアル判定用（メーター上に次の制限がどこか示す）
  const activeLimit = getActiveLimit(distance);

  // 2Dスクロール演出用の背景比率計算
  // 1メートルあたり 15ピクセル スクロール
  const scrollOffset = Math.floor(distance * 12);

  // 停止ターゲット (駅の停止線) までの残り距離表示精度
  const distanceToStation = currentStation.distance - distance; // m
  const inStationView = Math.abs(distanceToStation) <= 80; // 駅の停止ズームレンジに入るか

  // 進捗バー比率 (全体距離に対して)
  const totalLength = route.totalDistance;
  const progressRatio = Math.min((distance / totalLength) * 100, 100);

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 font-sans select-none" id="game-simulation-screen">
      {/* 1. 操作＆インジケータパネル */}
      <header className="bg-slate-900 border-b border-slate-800 p-4 shrink-0 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              // 棄権時に音声を即座に完全停止
              if (audioCtxRef.current) {
                try {
                  if (motorGainRef.current) motorGainRef.current.gain.value = 0;
                  if (vvvfGainRef.current) vvvfGainRef.current.gain.value = 0;
                  if (motorOscRef.current) {
                    try { motorOscRef.current.stop(); } catch (e) {}
                  }
                  if (vvvfOscRef.current) {
                    try { vvvfOscRef.current.stop(); } catch (e) {}
                  }
                  audioCtxRef.current.close().catch(() => {});
                } catch (e) {}
                audioCtxRef.current = null;
              }
              onCancel();
            }}
            className="text-xs bg-slate-950 hover:bg-slate-800 border border-slate-800 py-2 px-3.5 rounded-lg font-bold transition flex items-center gap-1 cursor-pointer"
          >
            ← タイムアタックを棄権
          </button>
          <div>
            <span className="text-[10px] bg-emerald-900 text-emerald-400 px-1.5 py-0.5 rounded-full border border-emerald-800/40 mr-1.5 font-bold">
              {route.difficulty}
            </span>
            <span className="font-bold text-sm text-slate-200">{route.name}</span>
          </div>
        </div>

        {/* タイム・ペナルティ情報 */}
        <div className="flex items-center gap-4">
          {/* 効果音ON/OFF */}
          <button
            onClick={() => {
              setSoundEnabled(!soundEnabled);
              playBeep(600, 0.1);
            }}
            className="p-2 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg text-slate-400 hover:text-white transition shrink-0 cursor-pointer"
            title={soundEnabled ? '音声をオフ' : '音声をオン'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4" />}
          </button>

          <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1 flex items-center gap-2 font-mono shadow-inner">
            <Timer className="w-4 h-4 text-amber-500" />
            <div className="text-right">
              <span className="text-[9px] text-slate-500 block h-3">⏱ TIME ELAPSED</span>
              <span className="text-sm font-bold text-white tabular-nums">
                {elapsedTime.toFixed(2)} <span className="text-[10px] text-slate-500">s</span>
              </span>
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1 flex items-center gap-2 font-mono shadow-inner">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <div className="text-right">
              <span className="text-[9px] text-slate-500 block h-3">⚠️ ACCUM PENALTY</span>
              <span className="text-sm font-bold text-red-400 tabular-nums">
                +{accumulatedPenalty.toFixed(1)} <span className="text-[10px] text-slate-500">s</span>
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* 2. ２D アニメーションビューポート (メインゲーム画面) */}
      <main className="flex-grow flex flex-col items-center justify-between p-4 overflow-hidden relative min-h-[180px] bg-gradient-to-b from-sky-950 via-slate-950 to-slate-950 select-none">
        
        {/* 雨の日のアニメーション */}
        {isRaining && (
          <div className="absolute inset-0 pointer-events-none z-10 opacity-35 bg-[linear-gradient(170deg,rgba(255,255,255,0.08)_5%,transparent_80%)]">
            <div className="absolute inset-0 animate-pulse bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/10 via-transparent to-transparent" />
            <div className="absolute inset-0" style={{ 
              backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', 
              backgroundSize: '30px 40px',
              animation: 'rain-fall 0.8s infinite linear' 
            }} />
          </div>
        )}

        {/* スタッフの視点: 天気制限やATS警告等のアラート */}
        <div className="absolute top-4 left-4 z-20 space-y-2">
          {isRaining && (
            <span className="inline-flex items-center gap-1.5 bg-blue-950/90 border border-blue-500/30 text-blue-300 font-bold px-2.5 py-1 rounded-md text-[10px] shadow-md animate-pulse">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              雨天注意 (空転スリップ確率上昇)
            </span>
          )}
          {isATCWarning && (
            <span className="inline-flex items-center gap-1.5 bg-red-950/90 border border-red-500/80 text-red-400 font-bold px-3 py-1 rounded-md text-[10px] shadow-lg animate-bounce">
              <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
              ATC非常ブレーキ作動中 (速度制限超過)
            </span>
          )}
          {isSlipping && (
            <span className="inline-flex items-center gap-1 bg-amber-950/90 border border-amber-500/85 text-amber-400 font-bold px-2.5 py-1 rounded-md text-[10px] shadow-md">
              <Footprints className="w-3.5 h-3.5 animate-bounce" />
              空転検知 (Notch 戻してください)
            </span>
          )}
                    {isAtsAssisted && (
            <span className="inline-flex items-center gap-1 bg-purple-950/90 border border-purple-500/40 text-purple-300 font-bold px-2.5 py-1 rounded-md text-[10px] shadow-md">
              <Zap className="w-3.5 h-3.5" />
              ATS TASC アシスト
            </span>
          )}
        </div>

        {/* 電車＆線路エリア (合体して車輪が浮かないようにする) */}
        <div className="w-full flex flex-col items-center justify-end my-auto relative" id="train-and-track">
          
          {/* 駅ホーム (現在の駅への残り距離に合わせて物理的にスクロール) */}
          {inStationView && (
            <div 
              className="absolute pointer-events-none z-0 transition-opacity duration-300"
              style={{
                bottom: '1.5rem', // 線路 (24px = 1.5rem) のすぐ上に載せる
                left: '50%',
                transform: `translateX(calc(-50% + ${distanceToStation * 12}px))`, // 駅停止位置を基準に1m=12pxでスクロール
                width: '1800px', // 潤沢な幅のホーム
                height: '36px',
              }}
            >
              {/* ホームのコンクリート壁 & バラスト境界 */}
              <div className="w-full h-full bg-slate-800 border-t-[3px] border-slate-500 relative flex flex-col justify-between shadow-2xl">
                {/* 点字ブロック（黄色い細線） */}
                <div className="w-full h-1 bg-yellow-400 opacity-95 border-b border-amber-600" />
                
                {/* 構造物・壁面のコンクリート目地、影 */}
                <div className="absolute inset-x-0 bottom-0 h-2 bg-slate-950/40" />
                <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_98%,rgba(0,0,0,0.35)_98%)] bg-[size:120px_100%]" />
                
                {/* ホーム上の看板やベンチなどのデコレーション */}
                {/* 駅名標 (現在の駅名を表示!) */}
                <div className="absolute -top-[23px] left-[900px] transform -translate-x-1/2 flex flex-col items-center">
                  <div className="bg-white border-2 border-slate-700 rounded px-2.5 py-0.5 flex flex-col items-center shadow-lg">
                    {/* 駅名 */}
                    <span className="text-[10px] text-slate-900 font-extrabold leading-none">{currentStation.name}</span>
                    {/* 前後の駅名表示 */}
                    <div className="flex items-center gap-1.5 mt-[1.5px] text-[5px] text-slate-500 scale-90 font-mono leading-none">
                      {currentStationIdx > 0 && <span>{stations[currentStationIdx - 1]?.name}</span>}
                      <span className="text-emerald-600 font-bold">●</span>
                      {currentStationIdx < stations.length - 1 && <span>{stations[currentStationIdx + 1]?.name}</span>}
                    </div>
                    {/* JR東日本/JR西日本風の帯 */}
                    <div className="w-full h-[1.5px] bg-emerald-500 mt-[1.5px] rounded-full" />
                  </div>
                  {/* 看板を支える脚 */}
                  <div className="flex gap-4">
                    <div className="w-[1.5px] h-2 bg-slate-600" />
                    <div className="w-[1.5px] h-2 bg-slate-600" />
                  </div>
                </div>

                {/* 自動販売機 */}
                <div className="absolute -top-3.5 left-[500px] bg-sky-600 border border-sky-400 w-3.5 h-3.5 rounded-[1px] flex flex-col justify-between p-[0.5px] shadow-md animate-pulse">
                  <div className="w-full h-0.5 bg-black" />
                  <span className="text-[2.5px] text-white font-sans text-center leading-none">自販機</span>
                </div>
                <div className="absolute -top-3.5 left-[1300px] bg-red-600 border border-red-500 w-3.5 h-3.5 rounded-[1px] flex flex-col justify-between p-[0.5px] shadow-md">
                  <div className="w-full h-0.5 bg-black" />
                  <span className="text-[2.5px] text-white font-sans text-center leading-none">BOSS</span>
                </div>

                {/* 停止位置案内板 (停止線) */}
                <div className="absolute -top-7 left-[900px] flex flex-col items-center transform translate-x-[90px]">
                  <div className="bg-yellow-400 border border-slate-900 text-slate-950 font-black text-[8px] w-4.5 h-4.5 flex items-center justify-center rounded-sm shadow-sm animate-pulse">
                    3
                  </div>
                  <span className="text-[5px] text-yellow-300 font-bold scale-75 origin-top mt-0.5 whitespace-nowrap bg-slate-900/80 px-0.5 rounded">停止目標</span>
                  <div className="w-[1.5px] h-3 bg-slate-500" />
                </div>

                {/* ホーム上の安全柵/ホームドア (一部) */}
                <div className="absolute top-0 bottom-0 left-[200px] right-[200px] border-t-2 border-slate-400/30 flex justify-between pointer-events-none">
                  {Array.from({ length: 15 }).map((_, i) => (
                    <div key={i} className="w-[1px] h-full bg-slate-500/30" />
                  ))}
                </div>

                {/* 屋根の柱 */}
                <div className="absolute -top-12 left-[150px] w-1.5 h-12 bg-gradient-to-b from-slate-600 to-slate-800 border-x border-slate-700/80" />
                <div className="absolute -top-12 left-[450px] w-1.5 h-12 bg-gradient-to-b from-slate-600 to-slate-800 border-x border-slate-700/80" />
                <div className="absolute -top-12 left-[750px] w-1.5 h-12 bg-gradient-to-b from-slate-600 to-slate-800 border-x border-slate-700/80" />
                <div className="absolute -top-12 left-[1050px] w-1.5 h-12 bg-gradient-to-b from-slate-600 to-slate-800 border-x border-slate-700/80" />
                <div className="absolute -top-12 left-[1350px] w-1.5 h-12 bg-gradient-to-b from-slate-600 to-slate-800 border-x border-slate-700/80" />
                <div className="absolute -top-12 left-[1650px] w-1.5 h-12 bg-gradient-to-b from-slate-600 to-slate-800 border-x border-slate-700/80" />
              </div>
            </div>
          )}

          {/* Layer 3: 電車本体 (3両編成デコレーション - 超リアル本物再現モデル) */}
          <div className="relative flex flex-col items-center justify-end scale-90 md:scale-100 transition-all duration-300 origin-bottom z-10 w-full h-20 mb-[2px]">
          {(() => {
            const stripeColor = baseSpecs.color;
            const isE231 = trainType === 'E231';
            const isE233 = trainType === 'E233';
            const isE235 = trainType === 'E235';

            // ステンレス車体のリアル質感 (複数階調メタルグラデーション)
            const stainlessBg = "bg-gradient-to-b from-zinc-100 via-zinc-300 via-zinc-200 to-zinc-400 border border-zinc-500 shadow-lg";
            
            // 熱線吸収グリーングラス窓のグラデーション反射
            const realWindowClass = "bg-[linear-gradient(135deg,rgba(11,21,17,0.95)_0%,rgba(16,185,129,0.25)_40%,rgba(56,189,248,0.3)_60%,rgba(11,21,17,0.95)_100%)] border border-zinc-500/80 rounded-[2px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.6)]";

            return (
                 <div className="flex flex-col items-center">
                   <div className="flex gap-1 items-end">
                     {/* 3両目 (中間車) */}
                     <div 
                       className={`w-20 h-8 rounded-md flex items-center justify-between px-1.5 relative ${stainlessBg} overflow-hidden`}
                     >
                       {/* 屋根上クーラー (実車デザイン: AU726・金属カバー) */}
                       <div className="absolute -top-[1.2px] left-1/2 transform -translate-x-1/2 w-11 h-1 bg-gradient-to-b from-zinc-300 to-zinc-400 border-[0.5px] border-zinc-500 rounded-t-sm z-0 flex gap-1 px-1 justify-between">
                         <div className="w-1.5 h-[1px] bg-zinc-650 rounded-full" />
                         <div className="w-1.5 h-[1px] bg-zinc-650 rounded-full" />
                         <div className="w-1.5 h-[1px] bg-zinc-650 rounded-full" />
                       </div>

                       {/* ビード（プレスライン・ステンレスの凹凸） */}
                       <div className="absolute top-[8px] left-0 right-0 h-[0.5px] bg-zinc-400/40" />
                       <div className="absolute top-[12px] left-0 right-0 h-[0.5px] bg-zinc-400/40" />
                       <div className="absolute bottom-[8px] left-0 right-0 h-[0.5px] bg-zinc-500/30" />

                       {/* 側面帯 (E231 / E233) */}
                       {isE231 && (
                         <>
                           {/* 幕板帯(上) */}
                           <div className="absolute top-1 left-0 right-0 h-0.5 bg-emerald-500 border-b border-emerald-600" />
                           {/* 腰帯(下) */}
                           <div className="absolute bottom-1.5 left-0 right-0 h-1.5 bg-emerald-500" />
                         </>
                       )}
                       {isE233 && (
                         <>
                           {/* 幕板帯(上) - 橙色 */}
                           <div className="absolute top-1 left-0 right-0 h-[2px] bg-orange-500" />
                           {/* 腰帯(下) - 2重ライン(実車風) */}
                           <div className="absolute bottom-1.5 left-0 right-0 h-[4.5px] bg-orange-500 flex flex-col justify-between">
                             <div className="w-full h-[0.5px] bg-white opacity-90" />
                             <div className="w-full h-[3.5px] bg-orange-500" />
                           </div>
                         </>
                       )}

                       {/* E235系 (側面は帯がなく、ドア部に黄色縦緑。上部に細い黄緑+黒ライン) */}
                       {isE235 && (
                         <>
                           <div className="absolute top-[0.5px] left-0 right-0 h-[1px] bg-lime-404" />
                           <div className="absolute top-1.2 left-0 right-0 h-[1.8px] bg-zinc-900 border-b border-lime-400/80" />
                         </>
                       )}

                       {/* 左側ドア */}
                       <div className={`w-3.5 h-full border-x border-zinc-400/60 flex flex-col justify-start relative items-center z-10 shrink-0 ${
                         isE235 
                           ? 'bg-gradient-to-b from-lime-400 via-lime-500 to-lime-600 shadow-[inset_0_0_1.5px_#84cc16]' 
                           : 'bg-gradient-to-b from-zinc-200 to-zinc-350'
                       }`}>
                         <div className="w-2.2 h-3.2 bg-zinc-950 mt-1 border border-zinc-500/85 rounded-sm overflow-hidden flex justify-center">
                           <div className="w-[1px] h-full bg-slate-800" />
                         </div>
                         <div className="flex-1 w-[1.5px] bg-zinc-800/80" />
                         {!isE235 && <div className="absolute left-[0.2px] right-[0.2px] bottom-[1.5px] h-[1px] bg-yellow-400" />}
                         <div className="absolute bottom-0 w-full h-[1px] bg-zinc-650" />
                        </div>
                      </div>

                      {/* 2両目 (中間車・パンタグラフ付) */}
                      <div 
                        className={`w-20 h-8 rounded-md flex items-center justify-between px-1.5 relative ${stainlessBg} overflow-visible`}
                      >
                        {/* 屋根上クーラー (実車デザイン: AU726・金属カバー) */}
                        <div className="absolute -top-[1.2px] right-2 w-10 h-1 bg-gradient-to-b from-zinc-300 to-zinc-400 border-[0.5px] border-zinc-500 rounded-t-sm z-0 flex gap-0.5 px-0.5 justify-between">
                          <div className="w-1.5 h-[1px] bg-zinc-650 rounded-full" />
                          <div className="w-1.5 h-[1px] bg-zinc-650 rounded-full" />
                          <div className="w-1.5 h-[1px] bg-zinc-650 rounded-full" />
                        </div>

                        {/* シングルアームパンタグラフ */}
                        <div className="absolute -top-3.5 left-4 w-8 h-4 pointer-events-none flex items-end justify-center z-30">
                          <div className="relative">
                            <svg viewBox="0 0 24 24" className="w-5 h-5 text-zinc-400 fill-none stroke-current stroke-[1.6] drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
                              <line x1="2" y1="20" x2="18" y2="20" />
                              <path d="M 4 20 L 12 11 L 7 4 L 16 4" strokeLinecap="round" strokeLinejoin="round" />
                              <line x1="6" y1="4" x2="17" y2="4" />
                            </svg>
                            {speed > 10 && Math.random() > 0.90 && (
                              <span className="absolute -top-2 left-2.5 w-2 h-2 bg-cyan-400 rounded-full animate-ping shadow-[0_0_8px_cyan]" />
                            )}
                          </div>
                        </div>

                        {/* ビード（プレスライン・ステンレスの凹凸） */}
                        <div className="absolute top-[8px] left-0 right-0 h-[0.5px] bg-zinc-400/40" />
                        <div className="absolute top-[12px] left-0 right-0 h-[0.5px] bg-zinc-400/40" />
                        <div className="absolute bottom-[8px] left-0 right-0 h-[0.5px] bg-zinc-500/30" />

                        {/* 側面帯 (E231 / E233) */}
                        {isE231 && (
                          <>
                            {/* 幕板帯(上) */}
                            <div className="absolute top-1 left-0 right-0 h-0.5 bg-green-600" />
                            {/* 腰帯(下) */}
                            <div className="absolute bottom-1.5 left-0 right-0 h-1.5 bg-green-600" />
                          </>
                        )}
                        {isE233 && (
                          <>
                            {/* 幕板帯(上) */}
                            <div className="absolute top-1 left-0 right-0 h-[2px] bg-orange-500" />
                            {/* 腰帯(下) - 2重ライン(実車風) */}
                            <div className="absolute bottom-1.5 left-0 right-0 h-[4.5px] bg-orange-500 flex flex-col justify-between">
                              <div className="w-full h-[0.5px] bg-white opacity-90" />
                              <div className="w-full h-[3.5px] bg-orange-500" />
                            </div>
                          </>
                        )}

                        {/* E235系 */}
                        {isE235 && (
                          <>
                            <div className="absolute top-[0.5px] left-0 right-0 h-[1px] bg-lime-404" />
                            <div className="absolute top-1.2 left-0 right-0 h-[1.8px] bg-zinc-900 border-b border-lime-400/80" />
                          </>
                        )}

                        {/* 左側ドア */}
                        <div className={`w-3.5 h-full border-x border-slate-400/60 flex flex-col justify-start relative items-center z-10 shrink-0 ${
                          isE235 
                            ? 'bg-gradient-to-b from-lime-400 via-lime-500 to-lime-600 shadow-[inset_0_0_1.5px_#84cc16]' 
                            : 'bg-gradient-to-b from-zinc-200 to-zinc-350'
                        }`}>
                          <div className="w-2.2 h-3.2 bg-slate-950 mt-1 border border-zinc-500/85 rounded-sm overflow-hidden flex justify-center">
                            <div className="w-[1px] h-full bg-slate-800" />
                          </div>
                          <div className="flex-1 w-[1.5px] bg-zinc-800/80" />
                          {!isE235 && <div className="absolute left-[0.2px] right-[0.2px] bottom-[1.5px] h-[1px] bg-yellow-400" />}
                          <div className="absolute bottom-0 w-full h-[1px] bg-zinc-650" />
                        </div>

                        {/* 中央窓 ＆ JRロゴ */}
                        <div className="flex-1 h-full flex flex-col items-center justify-center relative z-0">
                          <span className="text-[4px] text-slate-600 font-extrabold tracking-widest absolute top-0.5 font-sans scale-75 origin-top shrink-0">JR EAST</span>
                          <div className={`w-6.5 h-4 ${realWindowClass} mt-1 flex items-center justify-center relative`}>
                            <div className="absolute bottom-0 w-11/12 h-1 bg-emerald-700/60 rounded-t-[1px]" />
                          </div>
                          <span className="absolute bottom-0.5 text-[5px] text-zinc-650 font-extrabold tracking-tighter">CAR 2</span>
                        </div>

                        {/* 右側ドア */}
                        <div className={`w-3.5 h-full border-x border-slate-400/60 flex flex-col justify-start relative items-center z-10 shrink-0 ${
                          isE235 
                            ? 'bg-gradient-to-b from-lime-400 via-lime-500 to-lime-600 shadow-[inset_0_0_1.5px_#84cc16]' 
                            : 'bg-gradient-to-b from-zinc-200 to-zinc-350'
                        }`}>
                          <div className="w-2.2 h-3.2 bg-slate-950 mt-1 border border-zinc-500/85 rounded-sm overflow-hidden flex justify-center">
                            <div className="w-[1px] h-full bg-slate-800" />
                          </div>
                          <div className="flex-1 w-[1.5px] bg-zinc-800/80" />
                          {!isE235 && <div className="absolute left-[0.2px] right-[0.2px] bottom-[1.5px] h-[1px] bg-yellow-400" />}
                          <div className="absolute bottom-0 w-full h-[1px] bg-zinc-650" />
                        </div>
                      </div>

                      {/* 1両目 (先頭車両・コックピット側) */}
                      <div 
                      className="w-24 h-9 rounded-l-md flex items-center relative border border-slate-400 shadow-lg bg-gradient-to-b from-slate-200 via-slate-300 to-slate-400 overflow-visible"
                    >
                      {/* 屋根上クーラー (実車デザイン: AU726・金属カバー) ＆ アンテナ線 */}
                      <div className="absolute -top-[1.2px] left-5 w-10 h-1 bg-gradient-to-b from-slate-300 to-slate-400 border-[0.5px] border-slate-500 rounded-t-sm z-0 flex gap-0.5 px-0.5 justify-between">
                        <div className="w-1.5 h-[1px] bg-slate-600 rounded-full" />
                        <div className="w-1.5 h-[1px] bg-slate-600 rounded-full" />
                        <div className="w-1.5 h-[1px] bg-slate-600 rounded-full" />
                      </div>
                      {/* JR型受信用信号アンテナ (実車と同じ形のアンテナ再現) */}
                      <div className="absolute -top-1.5 right-6 w-0.5 h-1.5 bg-slate-400 rounded-sm z-0 relative flex items-center justify-center">
                        <div className="w-1 h-[1px] bg-slate-600 absolute -top-[1px]" />
                      </div>
                      {/* 防護無線アンテナ (実車と同じ台形傾斜) */}
                      <div className="absolute -top-[1.5px] right-8 w-1 h-1.5 bg-slate-400 rounded-t-sm z-0 transform skew-x-12" />

                      {/* 側面帯 (E231 / E233) */}
                      {isE231 && (
                        <>
                          {/* 幕板帯(上) */}
                          <div className="absolute top-1 left-0 right-5 h-0.5 bg-green-600" />
                          {/* 腰帯(下) */}
                          <div className="absolute bottom-1.5 left-0 right-5 h-1.5 bg-green-600" />
                        </>
                      )}
                      {isE233 && (
                        <>
                          {/* 幕板帯(上) */}
                          <div className="absolute top-1 left-0 right-5 h-[2px] bg-orange-500" />
                          {/* 腰帯(下) - 2重ライン(実車風) */}
                          <div className="absolute bottom-1.5 left-0 right-5 h-[4.5px] bg-orange-500 flex flex-col justify-between">
                            <div className="w-full h-[0.5px] bg-white opacity-90" />
                            <div className="w-full h-[3.5px] bg-orange-500" />
                          </div>
                        </>
                      )}

                      {/* E235系 */}
                      {isE235 && (
                        <>
                          <div className="absolute top-0.5 left-0 right-5 h-0.5 bg-lime-500" />
                          <div className="absolute top-1 left-0 right-5 h-[1.5px] bg-slate-900" />
                        </>
                      )}

                      {/* 最左端の客用ドア */}
                      <div className={`w-3.5 h-full border-r border-zinc-400/60 flex flex-col justify-start relative items-center z-10 shrink-0 ${
                        isE235 
                          ? 'bg-gradient-to-b from-lime-400 via-lime-500 to-lime-600 shadow-[inset_0_0_1.5px_#84cc16]' 
                          : 'bg-gradient-to-b from-zinc-200 to-zinc-350'
                      }`}>
                        <div className="w-2.2 h-3.2 bg-slate-950 mt-1 border border-zinc-500/85 rounded-sm overflow-hidden flex justify-center">
                          <div className="w-[1px] h-full bg-slate-800" />
                        </div>
                        <div className="flex-1 w-[1.5px] bg-zinc-800/80" />
                        {!isE235 && <div className="absolute left-[0.2px] right-[0.2px] bottom-[1.5px] h-[1px] bg-yellow-400" />}
                        <div className="absolute bottom-0 w-full h-[1px] bg-zinc-650" />
                      </div>

                      {/* 客室窓 */}
                      <div className="w-5 h-full flex items-center justify-center px-0.5 z-10 shrink-0 relative">
                        <div className={`w-full h-4.2 ${realWindowClass} flex items-center justify-center`} />
                      </div>

                      {/* 乗務員室扉 */}
                      <div className="w-3.5 h-[33px] border-r border-zinc-400/50 flex flex-col justify-start relative items-center z-10 shrink-0 bg-gradient-to-b from-zinc-350 via-zinc-250 to-zinc-400">
                        <div className="w-2 h-3.2 bg-zinc-950 rounded-sm border-b border-zinc-650 mt-1 relative" />
                      </div>

                      {/* --- 前面 (右端フェイス - お顔特徴リアル再現) --- */}
                      {isE231 && (
                        <div className="flex-1 h-full bg-stone-100 flex flex-col justify-between py-0.5 pl-1 pr-2 rounded-r-[6.5px] border-r-[2.2px] border-r-zinc-400 border-y border-zinc-300 relative shrink-0 shadow-[2px_1px_5px_rgba(0,0,0,0.3)]">
                          <div className="flex items-start justify-between mt-0.5 gap-0.5 z-10">
                            {/* フロントガラス回りブラック処理 */}
                            <div className="w-6.5 h-4.2 bg-zinc-950 rounded-sm flex flex-col p-[0.8px] justify-between shrink-0 border border-zinc-900 shadow-md">
                              <div className="text-[3px] text-emerald-400 scale-[0.6] origin-left font-mono font-black tracking-tighter">山手線</div>
                              <div className="w-full h-2.5 bg-sky-950/90 rounded-sm" />
                            </div>
                            <div className="flex flex-col items-end pt-1">
                              <span className="text-[4px] text-emerald-600 scale-[0.75] origin-right font-sans font-extrabold leading-none">E231</span>
                              <span className="text-[2.5px] text-emerald-400 scale-[0.7] origin-right font-mono font-black mt-0.5">500系</span>
                            </div>
                          </div>
                          {/* 緑帯お顔横切り */}
                          <div className="w-full h-1.5 bg-emerald-500 absolute bottom-2 left-0 right-0 z-0 border-y-[0.3px] border-emerald-600" />
                          
                          {/* 下部丸型ヘッドライト */}
                          <div className="flex justify-end items-center mt-auto mb-[1.5px] gap-0.5 z-10 relative">
                            <div className="flex items-center bg-zinc-900/60 rounded px-0.5 py-[0.5px]">
                              <span className={`w-1.5 h-1.5 rounded-full inline-block ${speed >= 0 ? 'bg-amber-300 shadow-[0_0_8px_#fde047]' : 'bg-zinc-600'} border-[0.3px] border-zinc-500`} />
                              <span className={`w-1 h-1 rounded-full inline-block ${speed > 0.1 ? 'bg-zinc-100 shadow-[0_0_6px_#ffffff]' : 'bg-zinc-600'} border-[0.3px] border-zinc-500 ml-[0.5px]`} />
                            </div>
                          </div>
                        </div>
                      )}

                      {isE233 && (
                        <div className="flex-1 h-full bg-zinc-200 flex flex-col justify-between py-0.5 pl-1 pr-2 rounded-r-[7px] border-r-[2px] border-r-zinc-500 border-y border-zinc-400 relative overflow-visible shrink-0 shadow-[2px_1px_5px_rgba(0,0,0,0.3)]">
                          {/* 【E233系本物の特徴】：ヘッドライトが窓の上（おでこ部）にある白色2灯！ */}
                          <div className="absolute -top-[1.2px] right-2 flex items-center bg-zinc-950 border border-zinc-700 rounded-sm px-1 py-[0.5px] z-30 shadow-md">
                            <div className="flex gap-[0.5px]">
                              <span className={`w-1.8 h-[1.2px] bg-white rounded-xs inline-block ${speed >= 0 ? 'shadow-[0_0_10px_#ffffff] bg-slate-100' : 'bg-zinc-600'}`} />
                              <span className={`w-1.8 h-[1.2px] bg-white rounded-xs inline-block ${speed >= 0 ? 'shadow-[0_0_10px_#ffffff] bg-slate-100' : 'bg-zinc-600'}`} />
                            </div>
                          </div>

                          <div className="flex items-start justify-between mt-0.5 gap-0.5 z-10">
                            {/* 緩やかな傾斜/ガラス */}
                            <div className="w-6.5 h-4.2 bg-zinc-950 border border-zinc-800 rounded-sm flex flex-col justify-between p-[0.8px] shrink-0">
                              <div className="text-[3px] text-orange-400 scale-[0.6] origin-left font-mono font-extrabold">E233</div>
                              <div className="w-full h-2.5 bg-sky-950/90 rounded-sm" />
                            </div>
                            <div className="flex flex-col items-end pt-0.5">
                              <div className="bg-zinc-950 text-orange-500 font-bold px-[1px] rounded-[0.5px] text-[2.5px] scale-90 border-[0.3px] border-zinc-800 animate-pulse whitespace-nowrap">東京</div>
                              <span className="text-[4px] text-orange-600 scale-[0.75] origin-right font-black leading-none mt-1 font-sans">中央特快</span>
                            </div>
                          </div>
                          {/* 太い中央線オレンジ */}
                          <div className="w-full h-[6.5px] bg-orange-500 absolute bottom-[5px] left-0 right-0 z-0 border-y border-white flex items-center justify-center">
                            <div className="w-full h-[0.6px] bg-white opacity-95" />
                          </div>
                          <div className="flex justify-end items-center mt-auto mb-[0.5px] z-10">
                            <span className="w-1 h-0.8 bg-red-700 border-[0.3px] border-zinc-900 rounded-[0.5px]" />
                          </div>
                        </div>
                      )}

                      {isE235 && (
                        <div className="flex-1 h-full bg-zinc-950 flex flex-col justify-between py-0.5 pl-1 pr-2 rounded-r-[6.5px] border-[2px] border-lime-500 relative shrink-0 shadow-[0_0_8px_rgba(132,204,22,0.4)] overflow-visible">
                          {/* 電子レンジ型フロント */}
                          <div className="flex items-start justify-between mt-0.5 gap-0.5 relative z-10">
                            <div className="w-6.5 h-4.2 bg-zinc-900 rounded-sm flex flex-col p-[0.8px] justify-between shrink-0 border border-lime-600/60 shadow-lg">
                              <div className="text-[3px] text-lime-400 scale-[0.6] origin-left font-mono">E235</div>
                              <div className="w-full h-2.5 bg-sky-950/80 rounded-sm" />
                            </div>
                            <div className="flex flex-col items-end pt-[1.5px]">
                              <div className="text-[2.8px] text-lime-404 scale-90 px-0.5 bg-black rounded-[0.5px] font-sans leading-none mt-1 font-black tracking-tight animate-pulse border-[0.3px] border-lime-500">
                                YAMANOTE
                              </div>
                            </div>
                          </div>
                          <div className="flex justify-between items-center mt-auto mb-[0.5px] z-10 px-0.5">
                            <div className="w-full flex justify-end">
                              <span className={`w-2.2 h-[1.2px] bg-white rounded-sm inline-block ${speed >= 0 ? 'bg-lime-200 shadow-[0_0_8px_#a3e635]' : 'bg-zinc-750'} border-[0.2px] border-zinc-950`} />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 車輪 (走行スピードに合わせて回転) & 台車フレーム */}
                  <div className="flex justify-around w-full px-4 mt-1 relative z-10">
                    {/* 台車1 */}
                    <div className="flex items-center gap-1 bg-slate-800/90 px-1 py-0.5 rounded-sm border border-slate-700 shadow-sm">
                      <span className={`w-3.5 h-3.5 border-2 border-slate-500 rounded-full bg-slate-950 shadow-inner flex items-center justify-center ${speed > 0.1 ? 'animate-spin' : ''}`} style={{ animationDuration: `${Math.max(0.12, 1.8 - (speed / 15))}s`, backgroundImage: 'conic-gradient(#1e293b 0% 25%, #475569 25% 50%, #1e293b 50% 75%, #475569 75% 100%)' }} />
                      <span className={`w-3.5 h-3.5 border-2 border-slate-500 rounded-full bg-slate-950 shadow-inner flex items-center justify-center ${speed > 0.1 ? 'animate-spin' : ''}`} style={{ animationDuration: `${Math.max(0.12, 1.8 - (speed / 15))}s`, backgroundImage: 'conic-gradient(#1e293b 0% 25%, #475569 25% 50%, #1e293b 50% 75%, #475569 75% 100%)' }} />
                    </div>
                    {/* 台車2 */}
                    <div className="flex items-center gap-1 bg-slate-800/90 px-1 py-0.5 rounded-sm border border-slate-700 shadow-sm">
                      <span className={`w-3.5 h-3.5 border-2 border-slate-500 rounded-full bg-slate-950 shadow-inner flex items-center justify-center ${speed > 0.1 ? 'animate-spin' : ''}`} style={{ animationDuration: `${Math.max(0.12, 1.8 - (speed / 15))}s`, backgroundImage: 'conic-gradient(#1e293b 0% 25%, #475569 25% 50%, #1e293b 50% 75%, #475569 75% 100%)' }} />
                      <span className={`w-3.5 h-3.5 border-2 border-slate-500 rounded-full bg-slate-950 shadow-inner flex items-center justify-center ${speed > 0.1 ? 'animate-spin' : ''}`} style={{ animationDuration: `${Math.max(0.12, 1.8 - (speed / 15))}s`, backgroundImage: 'conic-gradient(#1e293b 0% 25%, #475569 25% 50%, #1e293b 50% 75%, #475569 75% 100%)' }} />
                    </div>
                    {/* 台車3 */}
                    <div className="flex items-center gap-1 bg-slate-800/90 px-1 py-0.5 rounded-sm border border-slate-700 shadow-sm">
                      <span className={`w-3.5 h-3.5 border-2 border-slate-500 rounded-full bg-slate-950 shadow-inner flex items-center justify-center ${speed > 0.1 ? 'animate-spin' : ''}`} style={{ animationDuration: `${Math.max(0.12, 1.8 - (speed / 15))}s`, backgroundImage: 'conic-gradient(#1e293b 0% 25%, #475569 25% 50%, #1e293b 50% 75%, #475569 75% 100%)' }} />
                      <span className={`w-3.5 h-3.5 border-2 border-slate-500 rounded-full bg-slate-950 shadow-inner flex items-center justify-center ${speed > 0.1 ? 'animate-spin' : ''}`} style={{ animationDuration: `${Math.max(0.12, 1.8 - (speed / 15))}s`, backgroundImage: 'conic-gradient(#1e293b 0% 25%, #475569 25% 50%, #1e293b 50% 75%, #475569 75% 100%)' }} />
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Layer 4: 線路 ＆ 道床 (最大スピードで激しく流れる 1/1) */}
          <div 
            className="h-6 w-full bg-slate-900 border-t-2 border-slate-700 bg-[linear-gradient(180deg,#64748b_10%,#334155_20%,#0f172a_100%)] relative z-10"
            style={{
              backgroundImage: 'repeating-linear-gradient(90deg, #475569 0px, #475569 5px, rgba(255,250,230,0.02) 5px, rgba(255,250,230,0.02) 40px)',
              backgroundPositionX: `${-scrollOffset}px`,
              backgroundSize: '120px 100%'
            }}
          >
            {/* バラストドット */}
            <div className="absolute inset-x-0 bottom-0 h-2 bg-slate-950 opacity-40" />
          </div>
        </div>

          {/* タイムアタック進捗バー */}
        <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-inner my-2">
          <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono mb-1">
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-emerald-400" />
              始発: {stations[0].name}
            </span>
            <span className="text-white font-bold font-mono">
              走行 {(distance / 1000).toFixed(2)} km / {(totalLength / 1000).toFixed(1)} km
            </span>
            <span className="font-bold">
              終点: {stations[stations.length - 1].name}
            </span>
          </div>
          <div className="h-2.5 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-850 relative">
            {/* 各駅の位置指標 */}
            {stations.map((st, i) => {
              const ratio = (st.distance / totalLength) * 100;
              return (
                <div 
                  key={i} 
                  className="absolute top-0 bottom-0 w-1 bg-slate-700 z-10 hover:bg-emerald-400" 
                  style={{ left: `${ratio}%` }}
                  title={`${st.name} ID:${i}`}
                >
                  <span className="absolute -top-3.5 transform -translate-x-1/2 text-[8px] font-sans font-bold bg-slate-900 px-1 rounded text-slate-400">
                    {st.name.substring(0,2)}
                  </span>
                </div>
              );
            })}
            <div 
              className="h-full bg-gradient-to-r from-emerald-500 to-lime-500 rounded-full transition-all duration-100 ease-out relative" 
              style={{ width: `${progressRatio}%` }} 
            />
          </div>
        </div>
      </main>

      {/* 3. コックピット計器類 ＆ テキストログ */}
      <footer className="bg-slate-900 border-t border-slate-800 grid grid-cols-1 md:grid-cols-12 gap-4 p-4 shrink-0 select-none">
        
        {/* 計器（左側 4/12）: 速度計・制限速度 */}
        <div className="md:col-span-4 bg-slate-950 border border-slate-850 rounded-2xl p-4 flex justify-around items-center gap-4 relative">
          
          {/* 現在速度デジタル */}
          <div className="text-center font-mono">
            <span className="text-[9px] text-slate-500 block">DTR VELOCITY</span>
            <span className="text-4xl font-extrabold tracking-tight tabular-nums text-white inline-block">
              {Math.floor(speed)}
            </span>
            <span className="text-xs text-slate-400 ml-1">km/h</span>

            <div className="flex items-center gap-1.5 justify-center mt-1">
              <span className="text-[10px] text-slate-500">MAX</span>
              <span className="text-[10px] text-blue-400 font-bold">{specs.maxSpeed}km/h</span>
            </div>
          </div>

          <div className="w-px bg-slate-800 h-16" />

          {/* 制限速度インジケーター (ATC / ATS) */}
          <div className="text-center font-mono">
            <span className="text-[9px] text-slate-500 block">ATC SIGNAL</span>
            <div className={`text-3xl font-extrabold px-3 py-0.5 rounded-lg border-2 flex items-center justify-center tabular-nums mx-auto ${
              activeLimit <= speed + 2
                ? 'bg-red-950/40 text-red-400 border-red-500/80 animate-pulse'
                : 'bg-emerald-950/20 text-emerald-400 border-emerald-500/30'
            }`}>
              {activeLimit}
            </div>
            
            <div className="mt-1 text-[10px] text-slate-500">
              {distanceToStation > 0 ? (
                <span>駅まで <strong className="text-white">{distanceToStation.toFixed(0)}m</strong></span>
              ) : (
                <span className="text-red-400">オーバーラン中！</span>
              )}
            </div>
          </div>
        </div>

        {/* コントローラーマスコン & セレクター (中央 5/12) */}
        <div className="md:col-span-5 bg-slate-950 border border-slate-850 rounded-2xl p-4 flex flex-col justify-between gap-3">
          
          {/* 操作ボタン & ショートカットヒント */}
          <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono">
            <span className="flex items-center gap-1">
              <span className="border border-slate-700 px-1 py-0.5 rounded text-white font-bold">W / ↑</span>
              <span className="border border-slate-700 px-1 py-0.5 rounded text-white font-bold">S / ↓</span>
              キーでマスコン段階切替
            </span>
            <span className="text-emerald-500 font-bold">手動制御可能</span>
          </div>

          {/* ブレーキ/非常 ＆ 惰行 ＆ 加速 スライダーボタン */}
          <div className="flex items-stretch gap-1.5 h-12 w-full">
            {/* 非常ブレーキ */}
            <button
              onClick={() => setNotchTo(-9)}
              className={`flex-1 rounded-xl text-xs font-bold transition flex items-center justify-center cursor-pointer border-2 ${
                notch === -9
                  ? 'bg-red-600 text-white border-red-400 animate-pulse shadow-md shadow-red-500/20'
                  : 'bg-red-950/40 text-red-500 border-red-900/60 hover:bg-red-900/40'
              }`}
            >
              非常
            </button>

            {/* ブレーキ段B1..B8 */}
            <div className="flex-[3] grid grid-cols-4 gap-1">
              {[-8, -6, -4, -2].map((val) => {
                const active = notch === val;
                return (
                  <button
                    key={val}
                    onClick={() => setNotchTo(val)}
                    className={`rounded-lg font-mono text-xs font-bold transition flex items-center justify-center cursor-pointer ${
                      active
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-900 text-amber-500 border border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    B{Math.abs(val)}
                  </button>
                );
              })}
            </div>

            {/* ニュートラル */}
            <button
              onClick={() => setNotchTo(0)}
              className={`flex-1 rounded-xl font-mono text-xs font-bold transition flex items-center justify-center cursor-pointer ${
                notch === 0
                  ? 'bg-slate-100 text-slate-900 font-bold'
                  : 'bg-slate-900 text-slate-400 border border-slate-800 hover:bg-slate-800'
              }`}
            >
              N
            </button>

            {/* 加速段P1..P5 */}
            <div className="flex-[3] grid grid-cols-3 gap-1">
              {[1, 3, 5].map((val) => {
                const active = notch === val;
                return (
                  <button
                    key={val}
                    onClick={() => setNotchTo(val)}
                    className={`rounded-lg font-mono text-xs font-bold transition flex items-center justify-center cursor-pointer ${
                      active
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-slate-900 text-emerald-500 border border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    P{val}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 現在のマスコン状態のビジュアル表示 */}
          <div className="flex justify-between items-center px-2 py-1 bg-slate-900/50 rounded-xl text-xs">
            <span className="text-slate-500">MASCON STATE</span>
            <span className={`font-mono font-bold tracking-wider ${
              notch > 0 ? 'text-emerald-400' : notch < 0 ? 'text-amber-400' : 'text-slate-300'
            }`}>
              {notch === -9 ? 'EMERGENCY BRAKE (非常)' 
                : notch < 0 ? `BRAKE LEVEL ${Math.abs(notch)} (制動)` 
                : notch > 0 ? `POWER ACCEL ${notch} (力行)` 
                : 'IDLE / NEUTRAL (惰行)'}
            </span>
          </div>
        </div>

        {/* コネクト・イベントログ (右側 3/12) */}
        <div className="md:col-span-3 bg-slate-950 border border-slate-850 rounded-2xl p-4 flex flex-col justify-start gap-1">
          <span className="text-[9px] text-slate-500 font-mono block border-b border-slate-900 pb-1">DRIVE CTC CENTRAL LOGS</span>
          <div className="flex-grow overflow-hidden font-mono text-[10px] space-y-1.5 leading-relaxed text-slate-300 min-h-[60px] flex flex-col justify-start">
            {logs.slice(0, 3).map((log, index) => (
              <p key={index} className={index === 0 ? 'text-emerald-400 font-bold border-l-2 border-emerald-500 pl-1' : 'text-slate-500'}>
                {log}
              </p>
            ))}
          </div>

          <div className="border-t border-slate-900/85 pt-1 mt-auto">
            <button
              onClick={handleStartStop}
              className={`w-full text-xs font-bold py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer shadow ${
                isPlaying
                  ? 'bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800'
                  : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
              }`}
            >
              {isPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5 fill-slate-300" />
                  <span>ポーズ一時停止</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-slate-950" />
                  <span>運転再開 / 出発</span>
                </>
              )}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
