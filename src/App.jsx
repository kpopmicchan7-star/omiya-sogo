import { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  collection,
  onSnapshot,
  query,
  where,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
} from "firebase/firestore";

const FLOORS = ["B1", "1F", "2F", "3F", "4F", "5F", "6F", "7F", "8F", "9F", "10F", "11F", "12F", "13F"];
const VENDORS = ["浪速", "佐川"];

// 売り場リストは全員共有のFirestore上のデータが正。
// コード側に既定値は持たない（誤って上書きしないため）。
const EMPTY_SHOPS = FLOORS.reduce((acc, f) => { acc[f] = []; return acc; }, {});

// ===== Firebase 接続設定 =====
const firebaseConfig = {
  apiKey: "AIzaSyCPYJ63COhmJe3NOtdpomdgjRjGv411d7U",
  authDomain: "omiya-sogo.firebaseapp.com",
  projectId: "omiya-sogo",
  storageBucket: "omiya-sogo.firebasestorage.app",
  messagingSenderId: "942337443729",
  appId: "1:942337443729:web:3c60810dffa8e26d867c30",
  measurementId: "G-1G0NKLS2TW"
};

// Firestoreのドキュメント参照先
const SHOPS_DOC_PATH = ["config", "shops"];           // 売り場リスト（全員共有・1つだけ）
const RECORDS_COLLECTION = "records";                  // 集荷データ（1件＝1ドキュメント、全員共有）

// Firebaseアプリを1回だけ初期化（モジュール読み込み時）
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

function getTimeStr() {
  const now = new Date();
  return now.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}
function getDateStr() {
  const now = new Date();
  return now.toLocaleDateString("ja-JP", { month: "2-digit", day: "2-digit", weekday: "short" });
}
function getDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
}

// "2026-07-29" → "07/29(水)"
function formatDateKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d)
    .toLocaleDateString("ja-JP", { month: "2-digit", day: "2-digit", weekday: "short" });
}

// 日付キーを前後にずらす
function shiftDateKey(key, days) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
}

// この端末を識別するID（プッシュ通知の宛先管理に使用）
const DEVICE_ID = (() => {
  try {
    let id = localStorage.getItem("pickup-device-id");
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem("pickup-device-id", id);
    }
    return id;
  } catch {
    return "device-" + Math.random().toString(36).slice(2);
  }
})();

// ===== プッシュ通知（アプリを閉じていても届く通知）=====

const PUSH_SUBS_COLLECTION = "pushSubs";

// VAPID公開鍵（公開して問題ない鍵です。秘密鍵はVercelの環境変数側にあります）
const VAPID_PUBLIC_KEY = "BEkC-ReLuA_JBVDgJKng4jr6XOcOCpCQgYpRqJjCq9hbt2jGIJxfFgf46Vmow4zdVTMIYkKusruUcX-MG_GZ1rM";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent || "");

// ホーム画面アプリとして起動しているか（iPhoneはこれが必須条件）
function isStandalone() {
  try {
    return window.navigator.standalone === true
      || window.matchMedia("(display-mode: standalone)").matches;
  } catch {
    return false;
  }
}

function pushSupported() {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [connError, setConnError] = useState(false);
  const [shops, setShops] = useState(EMPTY_SHOPS);
  const [view, setView] = useState("form");
  const [settingsFloor, setSettingsFloor] = useState("B1");
  const [newShopInput, setNewShopInput] = useState("");
  const [filterFloor, setFilterFloor] = useState("ALL");

  // フォーム
  const [floor, setFloor] = useState("");
  const [shopName, setShopName] = useState("");
  const [shopManual, setShopManual] = useState("");
  const [vendor, setVendor] = useState("");
  const [boxCount, setBoxCount] = useState("");
  const [hangerCount, setHangerCount] = useState("");
  const [sagawaCount, setSagawaCount] = useState("");
  const [note, setNote] = useState("");

  const [records, setRecords] = useState([]);
  const [saved, setSaved] = useState(false);
  const [editId, setEditId] = useState(null);

  // プッシュ通知
  const [pushState, setPushState] = useState("checking"); // checking|unsupported|need-install|denied|off|on
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState("");
  const swRegRef = useRef(null);

  // Service Workerの登録と、現在の通知状態の判定
  useEffect(() => {
    (async () => {
      if (!pushSupported()) {
        setPushState(isIOS && !isStandalone() ? "need-install" : "unsupported");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        swRegRef.current = reg;
        await navigator.serviceWorker.ready;

        if (isIOS && !isStandalone()) {
          setPushState("need-install");
          return;
        }
        if (Notification.permission === "denied") {
          setPushState("denied");
          return;
        }
        const sub = await reg.pushManager.getSubscription();
        setPushState(sub && Notification.permission === "granted" ? "on" : "off");
      } catch (e) {
        console.error("Service Workerの登録に失敗", e);
        setPushState("unsupported");
      }
    })();
  }, []);

  // この端末で通知を受け取れるようにする
  const enablePush = async () => {
    setPushBusy(true);
    setPushMsg("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushState(permission === "denied" ? "denied" : "off");
        setPushMsg("通知が許可されませんでした。");
        return;
      }

      const reg = swRegRef.current || (await navigator.serviceWorker.ready);
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      await setDoc(doc(db, PUSH_SUBS_COLLECTION, DEVICE_ID), {
        subscription: JSON.parse(JSON.stringify(sub)),
        updatedAt: Date.now(),
      });

      setPushState("on");
      setPushMsg("この端末で通知を受け取れるようになりました。");
    } catch (e) {
      console.error("通知の登録に失敗", e);
      setPushMsg("通知の登録に失敗しました。時間をおいて試してください。");
    } finally {
      setPushBusy(false);
    }
  };

  // この端末の通知を止める
  const disablePush = async () => {
    setPushBusy(true);
    setPushMsg("");
    try {
      const reg = swRegRef.current || (await navigator.serviceWorker.ready);
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      await deleteDoc(doc(db, PUSH_SUBS_COLLECTION, DEVICE_ID)).catch(() => {});
      setPushState("off");
      setPushMsg("この端末への通知を止めました。");
    } catch (e) {
      console.error("通知の解除に失敗", e);
    } finally {
      setPushBusy(false);
    }
  };

  // 他の端末へプッシュ通知を送る（自分の端末は除く）
  const sendPush = async (rec) => {
    try {
      const snap = await getDocs(collection(db, PUSH_SUBS_COLLECTION));
      const targets = snap.docs
        .filter(d => d.id !== DEVICE_ID)
        .map(d => ({ id: d.id, subscription: d.data().subscription }))
        .filter(t => t.subscription);

      if (targets.length === 0) return;

      const counts = rec.vendor === "浪速"
        ? [rec.boxCount > 0 ? `箱${rec.boxCount}` : null,
           rec.hangerCount > 0 ? `ハンガー${rec.hangerCount}` : null].filter(Boolean).join(" / ")
        : `${rec.sagawaCount}個`;

      const res = await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targets,
          title: `📦 ${rec.floor} ${rec.shopName}`,
          body: `${rec.vendor}　${counts}${rec.note ? `　${rec.note}` : ""}`,
          url: "/",
        }),
      });

      const data = await res.json().catch(() => ({}));
      // 無効になった購読は削除しておく
      if (Array.isArray(data.expired)) {
        await Promise.all(
          data.expired.map(id => deleteDoc(doc(db, PUSH_SUBS_COLLECTION, id)).catch(() => {}))
        );
      }
    } catch (e) {
      console.error("プッシュ通知の送信に失敗", e);
      // 通知が飛ばなくても登録自体は成功しているので、ここでは何もしない
    }
  };

  // ===== 一時的なテスト送信（原因調査用）=====
  const [testBusy, setTestBusy] = useState(false);
  const [testLog, setTestLog] = useState("");

  const sendTestPush = async () => {
    setTestBusy(true);
    setTestLog("送信中…");
    try {
      const snap = await getDocs(collection(db, PUSH_SUBS_COLLECTION));
      const all = snap.docs.map(d => ({ id: d.id, subscription: d.data().subscription }));
      const valid = all.filter(t => t.subscription && t.subscription.endpoint);

      let log = `登録端末: ${all.length}台 / 有効: ${valid.length}台\n`;
      log += `この端末のID: ${DEVICE_ID.slice(0, 8)}…\n`;

      if (valid.length === 0) {
        setTestLog(log + "→ 送信先がありません。各端末で「通知を受け取る」を押してください。");
        return;
      }

      const res = await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targets: valid,   // 自分の端末も含める
          title: "📦 テスト通知",
          body: "これが見えていれば通知の仕組みは動いています",
          url: "/",
        }),
      });

      const text = await res.text();
      log += `応答: ${res.status}\n${text}`;
      setTestLog(log);
    } catch (e) {
      setTestLog("失敗: " + (e && e.message ? e.message : String(e)));
    } finally {
      setTestBusy(false);
    }
  };

  const isNaniva = vendor === "浪速";

  // 今日の日付キーと、一覧で表示中の日付キー
  const [todayKey, setTodayKey] = useState(getDateKey());
  const [viewDateKey, setViewDateKey] = useState(getDateKey());
  const isToday = viewDateKey === todayKey;

  // 日付が変わったら自動的に「今日」へ切り替える
  useEffect(() => {
    const timer = setInterval(() => {
      const nowKey = getDateKey();
      if (nowKey !== todayKey) {
        setViewDateKey(prev => (prev === todayKey ? nowKey : prev));
        setTodayKey(nowKey);
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [todayKey]);

  // ===== 売り場リスト：リアルタイム購読 =====
  useEffect(() => {
    const shopsDocRef = doc(db, SHOPS_DOC_PATH[0], SHOPS_DOC_PATH[1]);
    const unsubShops = onSnapshot(shopsDocRef, (snap) => {
      if (snap.exists()) {
        setShops(snap.data().byFloor || EMPTY_SHOPS);
        return;
      }
      // 「存在しない」がキャッシュ由来のときは書き込まない。
      // （サーバーに届く前に初期値で上書きしてしまう事故を防ぐ）
      if (snap.metadata.fromCache) return;
      setDoc(shopsDocRef, { byFloor: EMPTY_SHOPS })
        .catch(e => console.error("初期売り場の書込失敗", e));
    }, (err) => {
      console.error("売り場リストの購読エラー", err);
      setConnError(true);
    });
    return () => unsubShops();
  }, []);

  // ===== 表示中の日の集荷データ：リアルタイム購読 =====
  useEffect(() => {
    const recordsColRef = collection(db, RECORDS_COLLECTION);
    const q = query(recordsColRef, where("dateKey", "==", viewDateKey));
    const unsubRecords = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      setRecords(list);
      setLoading(false);
    }, (err) => {
      console.error("集荷データの購読エラー", err);
      setConnError(true);
      setLoading(false);
    });
    return () => unsubRecords();
  }, [viewDateKey]);

  // 日付を切り替える（絞り込みはリセット）
  const changeViewDate = (key) => {
    setViewDateKey(key);
    setFilterFloor("ALL");
  };


  const resetForm = () => {
    setFloor(""); setShopName(""); setShopManual("");
    setVendor(""); setBoxCount(""); setHangerCount(""); setSagawaCount(""); setNote("");
    setEditId(null);
  };

  const isValid = (() => {
    if (!floor || !(shopName || shopManual.trim()) || !vendor) return false;
    if (isNaniva) return (Number(boxCount) > 0 || Number(hangerCount) > 0);
    return Number(sagawaCount) > 0;
  })();

  const handleSubmit = async () => {
    if (!isValid) return;

    const entry = {
      floor,
      shopName: shopName || shopManual.trim(),
      vendor,
      boxCount: isNaniva ? (Number(boxCount) || 0) : 0,
      hangerCount: isNaniva ? (Number(hangerCount) || 0) : 0,
      sagawaCount: !isNaniva ? (Number(sagawaCount) || 0) : 0,
      note,
    };

    try {
      if (editId !== null) {
        // 編集では日付は変えない
        await updateDoc(doc(db, RECORDS_COLLECTION, editId), entry);
        setEditId(null);
      } else {
        await addDoc(collection(db, RECORDS_COLLECTION), {
          ...entry,
          dateKey: todayKey,
          time: getTimeStr(),
          date: getDateStr(),
          done: false,
          createdAt: Date.now(),
        });
        // 他の端末へプッシュ通知（新規登録のときだけ）
        sendPush(entry);
        // 過去の日を見ていた場合でも、今日の一覧に戻す
        if (viewDateKey !== todayKey) changeViewDate(todayKey);
      }

      // 直接入力された売り場を、そのフロアの売り場リストへ自動追加
      const typed = shopManual.trim();
      if (typed && !(shops[floor] || []).includes(typed)) {
        try {
          const updatedShops = { ...shops, [floor]: [...(shops[floor] || []), typed] };
          await setDoc(doc(db, SHOPS_DOC_PATH[0], SHOPS_DOC_PATH[1]), { byFloor: updatedShops });
        } catch (e2) {
          console.error("売り場リストへの自動追加に失敗しました", e2);
        }
      }

      resetForm();
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      console.error("登録に失敗しました", e);
      alert("登録に失敗しました。通信環境をご確認ください。");
    }
  };

  const handleEdit = (rec) => {
    setFloor(rec.floor); setShopName(rec.shopName); setShopManual("");
    setVendor(rec.vendor);
    setBoxCount(rec.boxCount > 0 ? String(rec.boxCount) : "");
    setHangerCount(rec.hangerCount > 0 ? String(rec.hangerCount) : "");
    setSagawaCount(rec.sagawaCount > 0 ? String(rec.sagawaCount) : "");
    setNote(rec.note); setEditId(rec.id);
    setView("form");
  };

  const handleDelete = async (id) => {
    try {
      await deleteDoc(doc(db, RECORDS_COLLECTION, id));
    } catch (e) {
      console.error("削除に失敗しました", e);
    }
    if (editId === id) resetForm();
  };

  const toggleDone = async (id, currentDone) => {
    try {
      await updateDoc(doc(db, RECORDS_COLLECTION, id), { done: !currentDone });
    } catch (e) {
      console.error("更新に失敗しました", e);
    }
  };

  const addShop = async () => {
    const name = newShopInput.trim();
    if (!name || shops[settingsFloor]?.includes(name)) return;
    const updated = { ...shops, [settingsFloor]: [...(shops[settingsFloor] || []), name] };
    try {
      await setDoc(doc(db, SHOPS_DOC_PATH[0], SHOPS_DOC_PATH[1]), { byFloor: updated });
      setNewShopInput("");
    } catch (e) {
      console.error("売り場の追加に失敗しました", e);
    }
  };

  const removeShop = async (fl, shop) => {
    const updated = { ...shops, [fl]: shops[fl].filter(x => x !== shop) };
    try {
      await setDoc(doc(db, SHOPS_DOC_PATH[0], SHOPS_DOC_PATH[1]), { byFloor: updated });
    } catch (e) {
      console.error("売り場の削除に失敗しました", e);
    }
  };

  const undoneCount = records.filter(r => !r.done).length;

  const totalNanivaBox = records.reduce((a, r) => a + (r.vendor === "浪速" ? r.boxCount : 0), 0);
  const totalNanivaHanger = records.reduce((a, r) => a + (r.vendor === "浪速" ? r.hangerCount : 0), 0);
  const totalSagawa = records.reduce((a, r) => a + (r.vendor === "佐川" ? r.sagawaCount : 0), 0);

  const filteredRecords = filterFloor === "ALL" ? records : records.filter(r => r.floor === filterFloor);
  const groupedByFloor = FLOORS.reduce((acc, f) => {
    const recs = filteredRecords.filter(r => r.floor === f);
    if (recs.length > 0) acc[f] = recs;
    return acc;
  }, {});
  const usedFloors = FLOORS.filter(f => records.some(r => r.floor === f));

  const Counter = ({ value, onChange, label }) => (
    <div style={s.countRow}>
      <span style={s.counterLabel}>{label}</span>
      <div style={s.counterControls}>
        <button style={s.countBtn} onClick={() => onChange(v => Math.max(0, Number(v||0)-1).toString())}>−</button>
        <input style={s.countInput} type="number" inputMode="numeric" min="0"
          placeholder="0" value={value}
          onChange={e => onChange(e.target.value)} />
        <button style={s.countBtn} onClick={() => onChange(v => (Number(v||0)+1).toString())}>＋</button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div style={s.loadingScreen}>
        <div style={s.loadingText}>📦 接続中…</div>
      </div>
    );
  }

  if (connError) {
    return (
      <div style={s.loadingScreen}>
        <div style={{ ...s.loadingText, color: "#C53030" }}>
          ⚠️ サーバーに接続できませんでした。<br/>通信環境をご確認の上、再読込してください。
        </div>
      </div>
    );
  }

  return (
    <div style={s.root}>
      {/* ヘッダー */}
      <div style={s.header}>
        <div>
          <div style={s.headerTitle}>📦 集荷受付</div>
          <div style={s.headerDate}>{getDateStr()}</div>
        </div>
        <div style={s.tabGroup}>
          {[["form","入力"], ["list","一覧"], ["settings","設定"]].map(([v, label]) => (
            <button key={v}
              style={{ ...s.tab, ...(view === v ? s.tabActive : {}) }}
              onClick={() => { setView(v); if (v !== "form") resetForm(); }}
            >
              {label}
              {v === "list" && undoneCount > 0 && <span style={s.badge}>{undoneCount}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* ===== 入力 ===== */}
      {view === "form" && (
        <div style={{ ...s.card, flex: "1 1 auto", display: "flex", flexDirection: "column" }}>
          {/* 余っている高さを上に寄せて、入力欄を下側に下げる */}
          <div style={{ flex: "1 1 0", minHeight: 0 }} />

          {editId !== null && <div style={s.editBanner}>✏️ 編集中</div>}

          <div style={s.field}>
            <label style={s.label}>🚚 業者</label>
            <div style={s.pillGroup}>
              {VENDORS.map(v => (
                <button key={v}
                  style={{
                    ...s.vendorPill,
                    ...(vendor === v ? (v === "浪速" ? s.vendorPillNaniva : s.vendorPillSagawa) : {})
                  }}
                  onClick={() => { setVendor(v); setBoxCount(""); setHangerCount(""); setSagawaCount(""); }}
                >{v}</button>
              ))}
            </div>
          </div>

          <div style={s.field}>
            <label style={s.label}>🔢 階数</label>
            <div style={s.pillGroup}>
              {FLOORS.map(f => (
                <button key={f}
                  style={{ ...s.pill, ...(floor === f ? s.pillActive : {}) }}
                  onClick={() => { setFloor(f); setShopName(""); setShopManual(""); }}
                >{f}</button>
              ))}
            </div>
          </div>

          <div style={s.field}>
            <label style={s.label}>🏪 売り場</label>
            {!floor ? (
              <div style={s.hint}>← 先に階数を選んでください</div>
            ) : (
              <>
                {(shops[floor] || []).length > 0 && (
                  <div style={s.pillGroup}>
                    {(shops[floor] || []).map(sh => (
                      <button key={sh}
                        style={{ ...s.pill, ...(shopName === sh ? s.pillActive : {}) }}
                        onClick={() => { setShopName(sh); setShopManual(""); }}
                      >{sh}</button>
                    ))}
                  </div>
                )}
                <input
                  style={{ ...s.input, marginTop: 8 }}
                  placeholder="一覧にない場合は直接入力"
                  value={shopManual}
                  onChange={e => { setShopManual(e.target.value); setShopName(""); }}
                />
              </>
            )}
          </div>

          {vendor && (
            <div style={s.field}>
              {isNaniva ? (
                <>
                  <label style={s.label}>📋 個数（浪速）</label>
                  <div style={s.counterStack}>
                    <Counter label="📦 箱" value={boxCount} onChange={setBoxCount} />
                    <Counter label="👔 ハンガー" value={hangerCount} onChange={setHangerCount} />
                  </div>
                </>
              ) : (
                <>
                  <label style={s.label}>📦 個数（佐川）</label>
                  <div style={s.counterStack}>
                    <Counter label="📦 個数" value={sagawaCount} onChange={setSagawaCount} />
                  </div>
                </>
              )}
            </div>
          )}

          <div style={s.field}>
            <label style={s.label}>📝 メモ（任意）</label>
            <input style={s.input} placeholder="時間指定、特記事項など"
              value={note} onChange={e => setNote(e.target.value)} />
          </div>

          <button
            style={{ ...s.submitBtn, ...(!isValid ? s.submitBtnDisabled : {}), ...(saved ? s.submitBtnSaved : {}) }}
            onClick={handleSubmit} disabled={!isValid}
          >
            {saved ? "✅ 登録しました！" : editId !== null ? "✏️ 更新する" : "登録する"}
          </button>
          {editId !== null && (
            <button style={s.cancelBtn} onClick={resetForm}>キャンセル</button>
          )}

          {/* 余白の配分：上1 / 下2 で、入力欄が上から約1/3の位置に来る */}
          <div style={{ flex: "2 1 0", minHeight: 0 }} />
        </div>
      )}

      {/* ===== 一覧 ===== */}
      {view === "list" && (
        <div>
          {/* 日付の切り替え */}
          <div style={s.dateBar}>
            <button
              style={s.dateArrow}
              onClick={() => changeViewDate(shiftDateKey(viewDateKey, -1))}
            >◀</button>

            <div style={s.dateLabelWrap}>
              <span style={s.dateLabel}>{formatDateKey(viewDateKey)}</span>
              {isToday && <span style={s.dateTodayTag}>今日</span>}
            </div>

            <button
              style={{ ...s.dateArrow, ...(isToday ? s.dateArrowDisabled : {}) }}
              onClick={() => { if (!isToday) changeViewDate(shiftDateKey(viewDateKey, 1)); }}
              disabled={isToday}
            >▶</button>
          </div>

          {!isToday && (
            <div style={s.backTodayWrap}>
              <button style={s.backTodayBtn} onClick={() => changeViewDate(todayKey)}>
                今日に戻る
              </button>
            </div>
          )}

          {records.length > 0 && (
            <div style={s.summaryBar}>
              <div style={s.summaryTitle}>
                📊 {isToday ? "本日の合計" : `${formatDateKey(viewDateKey)} の合計`}
              </div>
              <div style={s.summaryRow}>
                <div style={s.summaryCard}>
                  <div style={s.summaryVendor}>🟠 浪速</div>
                  <div style={s.summaryItems}>
                    <span style={s.summaryItem}>📦 箱 <strong>{totalNanivaBox}</strong></span>
                    <span style={s.summaryDivider}>／</span>
                    <span style={s.summaryItem}>👔 ハンガー <strong>{totalNanivaHanger}</strong></span>
                  </div>
                </div>
                <div style={s.summaryCard}>
                  <div style={s.summaryVendor}>🔵 佐川</div>
                  <div style={s.summaryItems}>
                    <span style={s.summaryItem}>📦 <strong>{totalSagawa}</strong> 個</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {records.length > 0 && (
            <div style={s.filterBar}>
              <button
                style={{ ...s.filterPill, ...(filterFloor === "ALL" ? s.filterPillActive : {}) }}
                onClick={() => setFilterFloor("ALL")}
              >
                全て <span style={s.filterCount}>{records.length}</span>
              </button>
              {usedFloors.map(f => {
                const cnt = records.filter(r => r.floor === f).length;
                const undone = records.filter(r => r.floor === f && !r.done).length;
                return (
                  <button key={f}
                    style={{ ...s.filterPill, ...(filterFloor === f ? s.filterPillActive : {}) }}
                    onClick={() => setFilterFloor(f)}
                  >
                    {f}
                    <span style={{ ...s.filterCount, background: undone > 0 ? "#E53E3E" : "#A0AEC0" }}>{cnt}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div style={s.listOuter}>
            {Object.keys(groupedByFloor).length === 0 ? (
              <div style={s.empty}>
                {records.length === 0
                  ? (isToday ? "まだ登録がありません" : "この日の登録はありません")
                  : "該当する受付がありません"}
              </div>
            ) : (
              Object.entries(groupedByFloor).map(([fl, recs]) => {
                const undoneInFloor = recs.filter(r => !r.done).length;
                return (
                  <div key={fl} style={s.floorGroup}>
                    <div style={s.floorHeader}>
                      <span style={s.floorLabel}>{fl}</span>
                      <span style={s.floorSummary}>
                        {undoneInFloor > 0
                          ? <span style={s.floorUndone}>未対応 {undoneInFloor}件</span>
                          : <span style={s.floorDone}>✅ 完了</span>
                        }
                        <span style={s.floorTotal}> / 計{recs.length}件</span>
                      </span>
                    </div>
                    {recs.map(rec => {
                      const isNan = rec.vendor === "浪速";
                      return (
                        <div key={rec.id}
                          style={{
                            ...s.recCard,
                            ...(rec.done ? s.recCardDone : {}),
                            borderLeftColor: rec.done ? "#CBD5E0" : (isNan ? "#E8873A" : "#3182CE")
                          }}
                        >
                          <div style={s.recTop}>
                            <span style={s.recTime}>{rec.time}</span>
                            <span style={{
                              ...s.recVendorBadge,
                              background: isNan ? "#FEEBC8" : "#EBF8FF",
                              color: isNan ? "#C05621" : "#2B6CB0",
                            }}>{rec.vendor}</span>
                          </div>
                          <div style={s.recMain}>
                            <span style={s.recShop}>{rec.shopName}</span>
                            <span style={s.recCountGroup}>
                              {isNan ? (
                                <>
                                  {rec.boxCount > 0 && <span style={s.recCountBadge}>📦 {rec.boxCount}</span>}
                                  {rec.hangerCount > 0 && <span style={s.recCountBadge}>👔 {rec.hangerCount}</span>}
                                </>
                              ) : (
                                <span style={s.recCountBadge}>📦 {rec.sagawaCount}</span>
                              )}
                            </span>
                          </div>
                          {rec.note && <div style={s.recNote}>📝 {rec.note}</div>}
                          <div style={s.recActions}>
                            <button
                              style={{ ...s.doneBtn, ...(rec.done ? s.doneBtnActive : {}) }}
                              onClick={() => toggleDone(rec.id, rec.done)}
                            >
                              {rec.done ? "✅ 完了" : "完了にする"}
                            </button>
                            <button style={s.editBtn} onClick={() => handleEdit(rec)}>編集</button>
                            <button style={s.deleteBtn} onClick={() => handleDelete(rec.id)}>削除</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ===== 設定 ===== */}
      {view === "settings" && (
        <>
        {/* プッシュ通知の設定 */}
        <div style={s.card}>
          <div style={s.settingsTitle}>🔔 通知の設定（この端末）</div>

          {pushState === "on" && (
            <>
              <div style={s.pushStatusOn}>✅ 通知オン｜アプリを閉じていても届きます</div>
              <button style={s.pushOffBtn} onClick={disablePush} disabled={pushBusy}>
                {pushBusy ? "処理中…" : "この端末の通知を止める"}
              </button>
            </>
          )}

          {pushState === "off" && (
            <>
              <div style={s.hint2}>ボタンを押すと、他の人が集荷を登録したときにスマホへ通知が届きます。</div>
              <button style={s.pushOnBtn} onClick={enablePush} disabled={pushBusy}>
                {pushBusy ? "登録中…" : "🔔 この端末で通知を受け取る"}
              </button>
            </>
          )}

          {pushState === "need-install" && (
            <div style={s.pushGuide}>
              <div style={s.pushGuideTitle}>📲 先にホーム画面に追加してください</div>
              <div style={s.pushGuideBody}>
                iPhoneは、ホーム画面のアイコンから開いたときだけ通知を使えます。
                <br /><br />
                1. このページを <b>Safari</b> で開く<br />
                2. 下の <b>共有ボタン（⬆️）</b> をタップ<br />
                3. <b>「ホーム画面に追加」</b> をタップ<br />
                4. 追加されたアイコンから開き直す<br />
                5. この設定画面に戻ってボタンを押す
              </div>
            </div>
          )}

          {pushState === "denied" && (
            <div style={s.pushGuide}>
              <div style={s.pushGuideTitle}>🔕 通知がブロックされています</div>
              <div style={s.pushGuideBody}>
                端末の「設定」アプリから、このアプリの通知を許可に変更してください。
              </div>
            </div>
          )}

          {pushState === "unsupported" && (
            <div style={s.hint}>この端末・ブラウザでは通知に対応していません。</div>
          )}

          {pushState === "checking" && <div style={s.hint}>確認中…</div>}

          {pushMsg && <div style={s.pushMsg}>{pushMsg}</div>}

          {/* 原因調査用（確認できたら外します） */}
          <div style={s.testBox}>
            <button style={s.testBtn} onClick={sendTestPush} disabled={testBusy}>
              {testBusy ? "送信中…" : "🧪 テスト通知を送る（自分にも届きます）"}
            </button>
            {testLog && <pre style={s.testLog}>{testLog}</pre>}
          </div>
        </div>

        {/* 売り場の設定 */}
        <div style={s.card}>
          <div style={s.settingsTitle}>🏢 フロア別 売り場の設定</div>
          <div style={s.hint2}>階を選んで売り場を追加・削除できます（チーム全員にすぐ反映されます）</div>


          <div style={{ ...s.field, marginTop: 12 }}>
            <label style={s.label}>階を選択</label>
            <div style={s.pillGroup}>
              {FLOORS.map(f => (
                <button key={f}
                  style={{ ...s.pill, ...(settingsFloor === f ? s.pillActive : {}), position: "relative" }}
                  onClick={() => { setSettingsFloor(f); setNewShopInput(""); }}
                >
                  {f}
                  {(shops[f]||[]).length > 0 && <span style={s.shopCount}>{shops[f].length}</span>}
                </button>
              ))}
            </div>
          </div>
          <div style={s.field}>
            <label style={s.label}>{settingsFloor} の売り場（{(shops[settingsFloor]||[]).length}件）</label>
            <div style={s.addRow}>
              <input style={{ ...s.input, flex: 1 }}
                placeholder="売り場名を入力"
                value={newShopInput}
                onChange={e => setNewShopInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addShop()}
              />
              <button style={s.addBtn} onClick={addShop}>追加</button>
            </div>
          </div>
          {(shops[settingsFloor] || []).length === 0
            ? <div style={s.hint}>まだ売り場が登録されていません</div>
            : (
              <div style={s.shopList}>
                {(shops[settingsFloor] || []).map(sh => (
                  <div key={sh} style={s.shopItem}>
                    <span style={s.shopItemName}>{sh}</span>
                    <button style={s.shopDeleteBtn} onClick={() => removeShop(settingsFloor, sh)}>✕</button>
                  </div>
                ))}
              </div>
            )
          }
        </div>
        </>
      )}
    </div>
  );
}

const s = {
  loadingScreen: {
    display: "flex", alignItems: "center", justifyContent: "center",
    height: "100vh", background: "#F0F4F8", padding: 24, textAlign: "center",
    fontFamily: "'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif",
  },
  loadingText: { color: "#4A5568", fontSize: 16, fontWeight: 600, lineHeight: 1.6 },

  root: {
    fontFamily: "'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif",
    background: "#F0F4F8", maxWidth: 500, margin: "0 auto",
    display: "flex", flexDirection: "column",
    minHeight: "100dvh",
    paddingBottom: "env(safe-area-inset-bottom, 0px)",
  },
  header: {
    background: "#1A3A5C", color: "#fff",
    padding: "calc(env(safe-area-inset-top, 0px) + 14px) 16px 10px",
    display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8,
  },
  headerTitle: { fontSize: 18, fontWeight: 700, letterSpacing: 1 },
  headerDate: { fontSize: 12, color: "#A8C0D6", marginTop: 2 },
  tabGroup: { display: "flex", gap: 6 },
  tab: {
    background: "rgba(255,255,255,0.15)", color: "#fff", border: "none",
    borderRadius: 20, padding: "6px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600, position: "relative",
  },
  tabActive: { background: "#fff", color: "#1A3A5C" },
  badge: {
    position: "absolute", top: -4, right: -4, background: "#E53E3E",
    color: "#fff", borderRadius: 10, fontSize: 10, padding: "1px 5px", fontWeight: 700,
  },

  // 日付の切り替え
  dateBar: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    background: "#fff", margin: "12px 12px 0", borderRadius: 12,
    padding: "8px 10px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
  },
  dateArrow: {
    width: 40, height: 36, borderRadius: 8, background: "#EDF2F7",
    border: "1.5px solid #CBD5E0", color: "#2D3748",
    fontSize: 14, fontWeight: 700, cursor: "pointer", flexShrink: 0,
  },
  dateArrowDisabled: {
    background: "#F7FAFC", color: "#CBD5E0", borderColor: "#E2E8F0", cursor: "not-allowed",
  },
  dateLabelWrap: { display: "flex", alignItems: "center", gap: 6 },
  dateLabel: { fontSize: 16, fontWeight: 800, color: "#1A3A5C", letterSpacing: 0.5 },
  dateTodayTag: {
    background: "#1A3A5C", color: "#fff", borderRadius: 10,
    padding: "1px 8px", fontSize: 10, fontWeight: 700,
  },
  backTodayWrap: { display: "flex", justifyContent: "center", marginTop: 8 },
  backTodayBtn: {
    background: "#EBF8FF", color: "#2B6CB0", border: "1.5px solid #BEE3F8",
    borderRadius: 20, padding: "5px 18px", fontSize: 12, fontWeight: 700, cursor: "pointer",
  },

  summaryBar: {
    background: "#1A3A5C", margin: "12px 12px 0", borderRadius: 12, padding: "12px 14px",
  },
  summaryTitle: { color: "#A8C0D6", fontSize: 11, fontWeight: 700, marginBottom: 8, letterSpacing: 1 },
  summaryRow: { display: "flex", gap: 10 },
  summaryCard: { flex: 1, background: "rgba(255,255,255,0.10)", borderRadius: 8, padding: "8px 10px" },
  summaryVendor: { color: "#fff", fontSize: 12, fontWeight: 700, marginBottom: 5 },
  summaryItems: { display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" },
  summaryItem: { color: "#E2E8F0", fontSize: 13 },
  summaryDivider: { color: "#718096", fontSize: 12 },

  filterBar: {
    display: "flex", overflowX: "auto", gap: 6, padding: "10px 12px 4px",
    scrollbarWidth: "none",
  },
  filterPill: {
    display: "flex", alignItems: "center", gap: 4,
    background: "#fff", color: "#4A5568", border: "1.5px solid #CBD5E0",
    borderRadius: 20, padding: "5px 12px", fontSize: 13, fontWeight: 600,
    cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
  },
  filterPillActive: { background: "#1A3A5C", color: "#fff", borderColor: "#1A3A5C" },
  filterCount: {
    background: "#A0AEC0", color: "#fff",
    borderRadius: 10, fontSize: 10, padding: "1px 5px", fontWeight: 700, minWidth: 16, textAlign: "center",
  },

  listOuter: { padding: "6px 12px 24px" },
  floorGroup: { marginBottom: 16 },
  floorHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "6px 4px 6px 2px", borderBottom: "2px solid #1A3A5C", marginBottom: 8,
  },
  floorLabel: { fontSize: 17, fontWeight: 800, color: "#1A3A5C", letterSpacing: 1 },
  floorSummary: { fontSize: 12, display: "flex", alignItems: "center", gap: 2 },
  floorUndone: { color: "#E53E3E", fontWeight: 700 },
  floorDone: { color: "#276749", fontWeight: 700 },
  floorTotal: { color: "#A0AEC0" },

  recCard: {
    background: "#fff", borderRadius: 10, padding: "10px 12px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.07)", borderLeft: "4px solid #1A3A5C", marginBottom: 8,
  },
  recCardDone: { opacity: 0.5 },
  recTop: { display: "flex", gap: 8, alignItems: "center", marginBottom: 3 },
  recTime: { fontSize: 11, color: "#718096", fontWeight: 600 },
  recVendorBadge: { borderRadius: 4, padding: "1px 7px", fontSize: 11, fontWeight: 700 },
  recMain: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  recShop: { fontSize: 15, fontWeight: 700, color: "#1A202C", flex: 1, marginRight: 8 },
  recCountGroup: { display: "flex", gap: 4, flexShrink: 0 },
  recCountBadge: {
    background: "#EDF2F7", color: "#2D3748",
    borderRadius: 6, padding: "2px 8px", fontSize: 13, fontWeight: 700,
  },
  recNote: { fontSize: 12, color: "#718096", marginTop: 3 },
  recActions: { display: "flex", gap: 6, marginTop: 8 },
  doneBtn: {
    flex: 1, background: "#EDF2F7", color: "#4A5568", border: "none",
    borderRadius: 6, padding: "6px 0", fontSize: 12, fontWeight: 600, cursor: "pointer",
  },
  doneBtnActive: { background: "#C6F6D5", color: "#276749" },
  editBtn: { background: "#EBF8FF", color: "#2B6CB0", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  deleteBtn: { background: "#FFF5F5", color: "#C53030", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" },

  card: {
    background: "#fff", margin: "14px 12px", borderRadius: 12,
    padding: "16px 14px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  },
  editBanner: {
    background: "#EBF8FF", color: "#2B6CB0", borderRadius: 6,
    padding: "6px 10px", fontSize: 13, fontWeight: 600, marginBottom: 12,
  },
  field: { marginBottom: 16 },
  label: { display: "block", fontSize: 12, fontWeight: 700, color: "#4A5568", marginBottom: 6, letterSpacing: 0.5 },
  input: {
    width: "100%", border: "1.5px solid #CBD5E0", borderRadius: 8,
    padding: "10px 12px", fontSize: 15, outline: "none",
    boxSizing: "border-box", color: "#2D3748", background: "#FAFAFA",
  },
  hint: { color: "#A0AEC0", fontSize: 13, padding: "6px 0" },
  hint2: { fontSize: 12, color: "#718096", marginBottom: 4 },
  pillGroup: { display: "flex", flexWrap: "wrap", gap: 6 },
  vendorPill: {
    background: "#EDF2F7", color: "#4A5568", border: "2px solid #CBD5E0",
    borderRadius: 10, padding: "10px 28px", fontSize: 16, fontWeight: 700,
    cursor: "pointer", flex: 1,
  },
  vendorPillNaniva: { background: "#E8873A", color: "#fff", borderColor: "#E8873A" },
  vendorPillSagawa: { background: "#3182CE", color: "#fff", borderColor: "#3182CE" },
  pill: {
    background: "#EDF2F7", color: "#4A5568", border: "1.5px solid #CBD5E0",
    borderRadius: 20, padding: "6px 14px", fontSize: 13, fontWeight: 600,
    cursor: "pointer", position: "relative",
  },
  pillActive: { background: "#1A3A5C", color: "#fff", borderColor: "#1A3A5C" },
  shopCount: {
    position: "absolute", top: -5, right: -5, background: "#4299E1",
    color: "#fff", borderRadius: 10, fontSize: 9, padding: "1px 4px", fontWeight: 700,
  },

  counterStack: { display: "flex", flexDirection: "column", gap: 6 },
  countRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    background: "#F7FAFC", borderRadius: 10, padding: "8px 12px",
    border: "1.5px solid #E2E8F0",
  },
  counterLabel: { fontSize: 14, fontWeight: 700, color: "#4A5568", flexShrink: 0 },
  counterControls: { display: "flex", alignItems: "center", gap: 6 },
  countBtn: {
    width: 32, height: 32, borderRadius: 16, background: "#EDF2F7",
    border: "1.5px solid #CBD5E0", fontSize: 18, cursor: "pointer",
    color: "#2D3748", fontWeight: 700, lineHeight: 1, flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  countInput: {
    width: 52, textAlign: "center", border: "1.5px solid #CBD5E0",
    borderRadius: 8, padding: "4px 0", fontSize: 18, fontWeight: 700,
    color: "#1A3A5C", background: "#fff", outline: "none", flexShrink: 0,
  },

  submitBtn: {
    width: "100%", background: "#1A3A5C", color: "#fff", border: "none",
    borderRadius: 10, padding: "14px 0", fontSize: 16, fontWeight: 700,
    cursor: "pointer", marginTop: 4, letterSpacing: 1,
  },
  submitBtnDisabled: { background: "#CBD5E0", color: "#A0AEC0", cursor: "not-allowed" },
  submitBtnSaved: { background: "#276749" },
  cancelBtn: {
    width: "100%", background: "none", color: "#718096", border: "1px solid #CBD5E0",
    borderRadius: 10, padding: "10px 0", fontSize: 14, cursor: "pointer", marginTop: 8,
  },
  empty: { textAlign: "center", color: "#A0AEC0", marginTop: 60, fontSize: 15 },
  settingsTitle: { fontSize: 15, fontWeight: 700, color: "#1A3A5C", marginBottom: 2 },


  // 通知設定
  pushStatusOn: {
    background: "#F0FFF4", color: "#276749", border: "1.5px solid #C6F6D5",
    borderRadius: 8, padding: "10px 12px", fontSize: 13, fontWeight: 700, margin: "8px 0 10px",
  },
  pushOnBtn: {
    width: "100%", background: "#276749", color: "#fff", border: "none",
    borderRadius: 10, padding: "13px 0", fontSize: 15, fontWeight: 700,
    cursor: "pointer", marginTop: 10,
  },
  pushOffBtn: {
    width: "100%", background: "none", color: "#718096", border: "1px solid #CBD5E0",
    borderRadius: 10, padding: "10px 0", fontSize: 13, cursor: "pointer",
  },
  pushGuide: {
    background: "#FFFAF0", border: "1.5px solid #FBD38D",
    borderRadius: 8, padding: "12px 14px", marginTop: 10,
  },
  pushGuideTitle: { fontSize: 14, fontWeight: 700, color: "#C05621", marginBottom: 6 },
  pushGuideBody: { fontSize: 13, color: "#744210", lineHeight: 1.8 },
  pushMsg: { fontSize: 12, color: "#2B6CB0", marginTop: 10 },

  // 調査用のテスト送信
  testBox: { marginTop: 14, borderTop: "1px dashed #CBD5E0", paddingTop: 12 },
  testBtn: {
    width: "100%", background: "#4A5568", color: "#fff", border: "none",
    borderRadius: 8, padding: "10px 0", fontSize: 13, fontWeight: 700, cursor: "pointer",
  },
  testLog: {
    marginTop: 10, background: "#1A202C", color: "#C6F6D5",
    borderRadius: 8, padding: "10px 12px", fontSize: 11, lineHeight: 1.6,
    whiteSpace: "pre-wrap", wordBreak: "break-all", fontFamily: "monospace",
  },
  addRow: { display: "flex", gap: 8, alignItems: "center" },
  addBtn: {
    background: "#1A3A5C", color: "#fff", border: "none", borderRadius: 8,
    padding: "10px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
  },
  shopList: { display: "flex", flexDirection: "column", gap: 6, marginTop: 4 },
  shopItem: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    background: "#F7FAFC", borderRadius: 8, padding: "8px 12px", border: "1px solid #E2E8F0",
  },
  shopItemName: { fontSize: 14, color: "#2D3748", fontWeight: 500 },
  shopDeleteBtn: {
    background: "none", border: "none", color: "#FC8181",
    fontSize: 16, cursor: "pointer", fontWeight: 700, padding: "0 4px",
  },
};