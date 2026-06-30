import { useState, useEffect } from "react";
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
} from "firebase/firestore";

const FLOORS = ["B1", "1F", "2F", "3F", "4F", "5F", "6F", "7F", "8F", "9F", "10F", "11F", "12F", "13F"];
const VENDORS = ["浪速", "佐川"];

const INITIAL_SHOPS = {
  "B1": ["食料品","銘菓・和菓子","洋菓子・ケーキ","ザ・ガーデン自由が丘","デリカ・惣菜","鮮魚","精肉","青果","パン","とんかつ まい泉","懐石料理 青山","柿安ダイニング","根津松本 鈴","とらや","鶴屋吉信","銀座ブールミッシュ","ル ショコラ ドゥ アッシュ","宗家 源 吉兆庵","叶 匠壽庵"],
  "1F": ["婦人靴","ハンドバッグ","洋品小物・アクセサリー","ハンカチーフ","CLATHAS","銀座ヨシノヤ","ミハマ","Salvatore Ferragamo","Cole Haan","COACH","Christian Dior","CHANEL","HERMES","GUCCI","BVLGARI","Tiffany & Co.","ROLEX","FEILER","ミスターミニット","特設会場"],
  "2F": ["化粧品・コスメ","Estée Lauder","Lancôme","SHISEIDO","Clé de Peau Beauté","CHANEL（コスメ）","Christian Dior（コスメ）","M・A・C","GUERLAIN","Clinique","KOSE","LUNASOL","RMK","COSME DECORTE","THREE","IPSA","Kanebo","MAQUILLAGE","ELIXIR","est","ayura","COVERMARK","REVLON","アクセサリー"],
  "3F": ["婦人服","アクセサリー","ANAYI","AMACA","EPOCA","ICB","UNTITLED","23区","Theory","Theory Luxe","MaxMara","MARGARET HOWELL","ISSEY MIYAKE","PLEATS PLEASE ISSEY MIYAKE","KUMIKYOKU","HUMAN WOMAN","ef-de","NATURAL BEAUTY","MOGA","LEILIAN","Reflect","DoCLASSE","LEONARD","Aquascutum","DAKS","nina ricci","Vivienne Westwood","CHANEL（ファッション）","LANVIN COLLECTION","KENZO","HIROKO KOSHINO","特設会場"],
  "4F": ["婦人服","宝飾・時計","インナー・下着","COUP DE CHANCE","QUEENS COURT","STRAWBERRY FIELDS","TABASA","Sybilla","L'EQUIPE","INED","22 OCTOBRE","LAUTREAMONT","Rose Tiara","Pinky＆Dianne","EVEX by KRIZIA","MS GRACY","Givenchy","LANVIN","Yves Saint Laurent","時計売場","OMEGA","TAG Heuer","BREITLING","Chopard","FRANCK MULLER","Piaget","Grand Seiko","SEIKO WATCH","CREDOR","婦人インナー・下着","WACOAL","triumph"],
  "5F": ["子供服・玩具","呉服","メガネ・補聴器","mikihouse","MIKIHOUSE FIRST","MIKIHOUSE DOUBLE.B","BeBe","pom ponette","mezzo piano","mezzo piano junior","hakka kids","BLUE CROSS","BLUE CROSS girls","kladskap","familiar","sanrio","akachan no shiro","KP（ニットプランナー）","呉服売場","メガネ売場","補聴器","るんびに","マロージュ","サンフェルメール"],
  "6F": ["紳士服・紳士洋品","ゴルフウェア","スポーツ","バッグ","POLO RALPH LAUREN","Ralph Lauren","HUGO BOSS","DAKS（メンズ）","Paul Smith","MACKINTOSH LONDON","J.PRESS","DURBAN","JOSEPH ABBOUD","adabat","BLACK&WHITE SPORTSWEAR","FootJoy","TaylorMade","Munsingwear","YONEX","THE NORTH FACE","Patagonia","Marmot","Jack Wolfskin","Foxfire","Millet","PROTECA","Samsonite","Gregory","Porter","山野楽器","バッグ売場","オーダーシャツ","ロイヤルサロン"],
  "7F": ["催事場","生活用品","ギフトサロン","商品券カウンター","JTB","美術画廊","ミレニアムカードカウンター","インフォメーション"],
  "8F": ["ロフト（LOFT）","三省堂書店","ブックス＆カフェ（UCC）","MUJI（無印良品）"],
  "9F": ["レストラン街","京懐石 美濃吉","銀座アスター 四季彩","香港蒸籠","牛兵衛 草庵","壁の穴","柿安ダイニング（レストラン）"],
  "10F": ["ワールドカレンシーショップ（外貨両替）","ペットショップ","グリーンショップ"],
  "11F": ["エステ","美容室","ビューティーゾーン"],
  "12F": ["エステ","クリニック","ビューティーゾーン"],
  "13F": ["湘南美容クリニック","ビューティーゾーン"],
};

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

export default function App() {
  const [loading, setLoading] = useState(true);
  const [connError, setConnError] = useState(false);
  const [shops, setShops] = useState(INITIAL_SHOPS);
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

  const isNaniva = vendor === "浪速";
  const todayKey = getDateKey();

  // Firestore関連の参照をrefに保持（再レンダーで作り直さない）
  // ===== 起動時：Firestoreのリアルタイム購読を開始 =====
  useEffect(() => {
    // ---- 売り場リスト：リアルタイム購読 ----
    const shopsDocRef = doc(db, SHOPS_DOC_PATH[0], SHOPS_DOC_PATH[1]);
    const unsubShops = onSnapshot(shopsDocRef, (snap) => {
      if (snap.exists()) {
        setShops(snap.data().byFloor || INITIAL_SHOPS);
      } else {
        setDoc(shopsDocRef, { byFloor: INITIAL_SHOPS }).catch(e => console.error("初期売り場の書込失敗", e));
      }
    }, (err) => {
      console.error("売り場リストの購読エラー", err);
      setConnError(true);
    });

    // ---- 本日の集荷データ：リアルタイム購読 ----
    const recordsColRef = collection(db, RECORDS_COLLECTION);
    const q = query(recordsColRef, where("dateKey", "==", todayKey));
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

    return () => {
      unsubShops();
      unsubRecords();
    };
  }, []);

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
      dateKey: todayKey,
    };

    try {
      if (editId !== null) {
        await updateDoc(doc(db, RECORDS_COLLECTION, editId), entry);
        setEditId(null);
      } else {
        await addDoc(collection(db, RECORDS_COLLECTION), {
          ...entry,
          time: getTimeStr(),
          date: getDateStr(),
          done: false,
          createdAt: Date.now(),
        });
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
        <div style={s.card}>
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
        </div>
      )}

      {/* ===== 一覧 ===== */}
      {view === "list" && (
        <div>
          {records.length > 0 && (
            <div style={s.summaryBar}>
              <div style={s.summaryTitle}>📊 本日の合計</div>
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
              <div style={s.empty}>{records.length === 0 ? "まだ登録がありません" : "該当する受付がありません"}</div>
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
    background: "#F0F4F8", minHeight: "100vh", maxWidth: 500, margin: "0 auto", paddingBottom: 40,
  },
  header: {
    background: "#1A3A5C", color: "#fff", padding: "14px 16px 10px",
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

  listOuter: { padding: "6px 12px 10px" },
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
