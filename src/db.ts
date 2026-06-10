import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  orderBy, 
  limit, 
  where,
  doc,
  getDocFromServer
} from 'firebase/firestore';
import { LeaderboardEntry, PlayerSave, TrainType, CustomizeState } from './types';
import firebaseConfig from '../firebase-applet-config.json';

// Safe check: Is Firebase Config loaded and complete?
const isFirebaseAvailable = !!(firebaseConfig && (firebaseConfig as any).apiKey);

let app: any = null;
let db: any = null;

if (isFirebaseAvailable) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    const dbId = (firebaseConfig as any).firestoreDatabaseId;
    db = dbId ? getFirestore(app, dbId) : getFirestore(app);
    console.log("Firebase is initialized with config:", (firebaseConfig as any).projectId, "DatabaseId:", dbId || "(default)");
  } catch (error) {
    console.error("Firebase startup failed:", error);
  }
}

// CRITICAL CONSTRAINT: Test connection when the application initially boots
async function testConnection() {
  if (!db) return;
  try {
    // Tests connection to server without caching
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Firestore connection test passed.");
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Firestore test skipped: client is offline.");
    } else {
      console.warn("Firestore connection test error (expected if terms aren't accepted yet):", error);
    }
  }
}

testConnection();

// OPERATION UTILITIES FOR ERROR HANDLING EXPLAINED IN SKILL
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: Record<string, any>;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null, // Simple fallback since we prioritize nick-based leaderboard without forced Auth flow
      email: null,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// LOCAL STORAGE KEY FOR SAVE STATE
const SAVE_DATA_KEY = 'train_ta_player_save';
const LOCAL_LEADERBOARD_KEY = 'train_ta_local_leaderboard';

const DEFAULT_SAVE: PlayerSave = {
  credits: 500, // 初期ポイント (カスタマイズお試し用)
  playerName: '新人運転士',
  customs: {
    E231: { motor: 1, vvvf: 1, brake: 1, ats: 1 },
    E233: { motor: 1, vvvf: 1, brake: 1, ats: 1 },
    E235: { motor: 1, vvvf: 1, brake: 1, ats: 1 },
  }
};

/**
 * プレイヤーセーブデータの読み込み
 */
export function loadSaveData(): PlayerSave {
  try {
    const data = localStorage.getItem(SAVE_DATA_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      // 新しいフィールドが追加された場合のフォールバックマージ
      return {
        ...DEFAULT_SAVE,
        ...parsed,
        customs: {
          E231: { ...DEFAULT_SAVE.customs.E231, ...(parsed.customs?.E231 || {}) },
          E233: { ...DEFAULT_SAVE.customs.E233, ...(parsed.customs?.E233 || {}) },
          E235: { ...DEFAULT_SAVE.customs.E235, ...(parsed.customs?.E235 || {}) },
        }
      };
    }
  } catch (e) {
    console.error("Local save load failed:", e);
  }
  return DEFAULT_SAVE;
}

/**
 * プレイヤーセーブデータの書き込み
 */
export function saveSaveData(save: PlayerSave): void {
  try {
    localStorage.setItem(SAVE_DATA_KEY, JSON.stringify(save));
  } catch (e) {
    console.error("Local save write failed:", e);
  }
}

/**
 * ローカルリーダーボードのロード
 */
function loadLocalLeaderboard(): LeaderboardEntry[] {
  try {
    const data = localStorage.getItem(LOCAL_LEADERBOARD_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

/**
 * ローカルリーダーボードへの追加
 */
function addLocalLeaderboard(entry: Omit<LeaderboardEntry, 'id'>): LeaderboardEntry {
  const list = loadLocalLeaderboard();
  const id = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const fullEntry: LeaderboardEntry = { ...entry, id, isLocal: true };
  list.push(fullEntry);
  list.sort((a, b) => a.totalScoreTime - b.totalScoreTime);
  localStorage.setItem(LOCAL_LEADERBOARD_KEY, JSON.stringify(list));
  return fullEntry;
}

/**
 * ランキングへエントリ登録 (Firestore優先、ローカル自動記録)
 */
export async function submitLeaderboardEntry(
  routeId: string,
  playerName: string,
  trainType: TrainType,
  time: number,
  penaltyTime: number,
  customs: CustomizeState
): Promise<LeaderboardEntry> {
  const totalScoreTime = Number((time + penaltyTime).toFixed(2));
  const entryPayload: Omit<LeaderboardEntry, 'id'> = {
    name: playerName || '名無し運転士',
    routeId,
    trainType,
    time: Number(time.toFixed(2)),
    penaltyTime: Number(penaltyTime.toFixed(2)),
    totalScoreTime,
    customs,
    createdAt: new Date().toISOString()
  };

  // 常にローカルにはコピーを書いておく
  const localResult = addLocalLeaderboard(entryPayload);

  if (db) {
    const colPath = 'leaderboards';
    try {
      console.log("Submitting record to Firestore...");
      const docRef = await addDoc(collection(db, colPath), {
        ...entryPayload,
        // Firestore rules requirements: server times if possible, but strict ISO validation fits standard structure
      });
      return {
        ...entryPayload,
        id: docRef.id,
        isLocal: false
      };
    } catch (error) {
      console.warn("Firestore submit failed, utilizing local fallback:", error);
      // We don't throw to the UI so users can still seamlessly play the game even if Terms aren't accepted yet
      return localResult;
    }
  }

  return localResult;
}

/**
 * 路線ごとのランキングを取得 (Firestoreを試みて取得。ダメ、あるいは未構成ならローカル)
 */
export async function getLeaderboard(routeId: string): Promise<LeaderboardEntry[]> {
  if (db) {
    const colPath = 'leaderboards';
    try {
      console.log(`Fetching rankings from Firestore for route: ${routeId}`);
      const q = query(
        collection(db, colPath),
        where('routeId', '==', routeId),
        orderBy('totalScoreTime', 'asc'),
        limit(15)
      );
      
      const querySnapshot = await getDocs(q);
      const items: LeaderboardEntry[] = [];
      querySnapshot.forEach((doc) => {
        const d = doc.data();
        items.push({
          id: doc.id,
          name: d.name,
          routeId: d.routeId,
          trainType: d.trainType,
          time: d.time,
          penaltyTime: d.penaltyTime,
          totalScoreTime: d.totalScoreTime,
          customs: d.customs,
          createdAt: d.createdAt,
          isLocal: false
        });
      });
      
      if (items.length > 0) {
        return items;
      }
    } catch (error) {
      console.warn("Firestore query failed, loading from local instead:", error);
      // We do not throw so the app remains resilient
    }
  }

  // フォールバック: ローカルランキング
  const localList = loadLocalLeaderboard();
  return localList
    .filter(item => item.routeId === routeId)
    .sort((a, b) => a.totalScoreTime - b.totalScoreTime)
    .slice(0, 15);
}

/**
 * 現在のFirebase連携状態を返す
 */
export function getFirebaseStatus(): { active: boolean; projectId?: string } {
  return {
    active: db !== null,
    projectId: (firebaseConfig as any)?.projectId
  };
}
