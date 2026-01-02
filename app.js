// =========================
// Firebase (Web SDK via CDN modules)
// =========================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ✅ 你的 Firebase 設定（已整合）
const firebaseConfig = {
  apiKey: "AIzaSyDMO5K4TXeUu89rSIA6yDo6LfvUcn_4O5s",
  authDomain: "my-drink-app-aef39.firebaseapp.com",
  projectId: "my-drink-app-aef39",
  storageBucket: "my-drink-app-aef39.firebasestorage.app",
  messagingSenderId: "871859123960",
  appId: "1:871859123960:web:21cb457ac63ae82fe9ad0d",
  measurementId: "G-6FH8VQWX8V"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 你這個 app 在 Firestore 的路徑識別（可改）
const APP_ID = "drink-tracker-2026";
const DOC_ID = "yearly2026";

// UI 常量
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const MONTHS = ["一月","二月","三月","四月","五月","六月","七月","八月","九月","十月","十一月","十二月"];
const ICE_LEVELS = ["正常","少冰","微冰","去冰","常溫","溫"];
const SUGAR_LEVELS = ["全糖","少糖","半糖","微糖","一分糖","無糖"];

// 本機保存 Gemini Key（不要 commit 到 GitHub）
const GEMINI_KEY_STORAGE = "my_drink_app_gemini_key";

// 狀態
let user = null;
let currentDate = new Date(2026, 0, 1);
let selectedDay = null;
let allRecords = {}; // { "2026-1-1": [drink1, drink2], ... }
let saveStatusTimer = null;

// =========================
// Helpers
// =========================
const pad = (n) => String(n).padStart(2, "0");
const dateKey = (y, m, d) => `${y}-${m}-${d}`;

function getGeminiKey() {
  return localStorage.getItem(GEMINI_KEY_STORAGE) || "";
}

function setGeminiKey(k) {
  localStorage.setItem(GEMINI_KEY_STORAGE, (k || "").trim());
}

function toastSaveStatus(text) {
  const el = document.getElementById("saveStatus");
  if (!el) return;
  el.textContent = text || "";
  clearTimeout(saveStatusTimer);
  if (text) {
    saveStatusTimer = setTimeout(() => (el.textContent = ""), 2000);
  }
}

function calcStats() {
  const data = Object.values(allRecords).flat().filter(r => r && r.name);
  const totalCups = data.length;
  const totalCost = data.reduce((sum, it) => sum + (Number(it.price) || 0), 0);
  const avgPrice = totalCups ? Math.round(totalCost / totalCups) : 0;

  const storeCounts = {};
  const itemCounts = {};
  for (const d of data) {
    if (d.shop) storeCounts[d.shop] = (storeCounts[d.shop] || 0) + 1;
    if (d.name) itemCounts[d.name] = (itemCounts[d.name] || 0) + 1;
  }

  const favoriteStore = Object.entries(storeCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || "無";
  const favoriteItem = Object.entries(itemCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || "無";

  return { totalCups, totalCost, avgPrice, favoriteStore, favoriteItem, rawHistory: data };
}

// =========================
// Firestore
// =========================
function userDocRef(uid) {
  return doc(db, "artifacts", APP_ID, "users", uid, "records", DOC_ID);
}

async function saveToCloud(newData) {
  if (!user) return;
  toastSaveStatus("儲存中...");
  try {
    await setDoc(userDocRef(user.uid), {
      data: newData,
      lastUpdated: new Date().toISOString(),
    });
    toastSaveStatus("已安全儲存");
  } catch (e) {
    console.error(e);
    toastSaveStatus("儲存失敗");
  }
}

// =========================
// Render
// =========================
function renderApp() {
  const root = document.getElementById("app");
  const stats = calcStats();

  root.innerHTML = `
    <div class="min-h-screen flex flex-col">
      <!-- Top bar -->
      <div class="bg-sky-500 pt-[env(safe-area-inset-top)] sticky top-0 z-40 shadow-lg">
        <div class="px-6 py-4 flex justify-between items-center text-white">
          <div class="flex items-center gap-2 font-black text-xl">
            <span class="inline-flex items-center justify-center w-9 h-9 rounded-2xl bg-white/20">🥤</span>
            <span>我超愛喝手搖</span>
          </div>
          <div class="flex items-center gap-3">
            <span id="saveStatus" class="text-[10px] font-bold bg-white/20 px-2 py-1 rounded">${""}</span>
            <button id="btnQuickToday" class="bg-white text-sky-600 px-4 py-2 rounded-full shadow-md active:scale-95 transition-transform font-black text-sm">
              ⚡ 快速紀錄今天
            </button>
          </div>
        </div>
      </div>

      <div class="flex-1 max-w-md mx-auto w-full px-4 mt-6 space-y-6 pb-28">
        <!-- Stats cards -->
        <div class="grid grid-cols-2 gap-3">
          ${statCard("年度杯數", `${stats.totalCups} 杯`, "bg-blue-500", "🥤")}
          ${statCard("年度總支出", `${stats.totalCost} 元`, "bg-emerald-500", "💰")}
          ${statCard("平均單價", `${stats.avgPrice} 元`, "bg-sky-500", "📈")}
          ${statCard("最愛店家", `${stats.favoriteStore}`, "bg-indigo-500", "🏪")}
        </div>
        <div class="grid grid-cols-1 gap-3">
          ${statCard("最愛品項", `${stats.favoriteItem}`, "bg-cyan-500", "➕")}
        </div>

        <!-- AI Card -->
        <div class="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
          <div class="flex items-center justify-between gap-2 mb-4">
            <div class="flex items-center gap-2 font-black text-slate-800">
              <span class="text-amber-400">✨</span> AI 飲品大師
            </div>
            <button id="btnSetKey" class="text-xs font-black text-slate-400 bg-slate-50 px-3 py-2 rounded-xl active:scale-95 transition">
              設定 Key
            </button>
          </div>

          <div class="text-slate-500 text-sm mb-4">基於你的飲用紀錄為你提供專屬建議</div>

          <div class="grid grid-cols-2 gap-2">
            <button id="btnAiAnalyze" class="bg-sky-50 text-sky-600 py-3 rounded-2xl font-black active:scale-95 transition-transform flex items-center justify-center gap-2">
              ✨ 分析推薦
            </button>
            <button id="btnSpeak" class="bg-amber-400 text-sky-900 py-3 rounded-2xl font-black active:scale-95 transition-transform flex items-center justify-center gap-2">
              🔊 報數聽看看
            </button>
          </div>

          <div id="aiBox" class="mt-4 hidden">
            <div class="p-4 bg-slate-50 rounded-2xl text-[13px] text-slate-600 leading-relaxed border-l-4 border-sky-400 whitespace-pre-wrap" id="aiText"></div>
          </div>
        </div>

        <!-- Calendar -->
        <div class="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
          <div class="flex items-center justify-between p-6 border-b border-slate-50">
            <button id="btnPrevMonth" class="p-2 text-slate-400 active:bg-slate-50 rounded-full">‹</button>
            <div class="text-center">
              <span class="text-xl font-black text-slate-800">${MONTHS[currentDate.getMonth()]}</span>
              <span class="ml-2 text-slate-300 font-bold">${currentDate.getFullYear()}</span>
            </div>
            <button id="btnNextMonth" class="p-2 text-slate-400 active:bg-slate-50 rounded-full">›</button>
          </div>

          <div class="p-4">
            <div class="grid grid-cols-7 mb-2 text-[10px] text-slate-300 font-black text-center uppercase tracking-widest">
              ${WEEKDAYS.map(d=>`<div>${d}</div>`).join("")}
            </div>
            <div id="calGrid" class="grid grid-cols-7 gap-1"></div>
          </div>
        </div>
      </div>

      <!-- Bottom Nav -->
      <div class="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-slate-100 px-8 pt-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] flex justify-around items-center z-40 shadow-2xl">
        <button class="text-sky-500 flex flex-col items-center gap-1">
          <span class="text-xl">📅</span>
          <span class="text-[10px] font-bold">日誌</span>
        </button>
        <button id="btnSpeak2" class="text-slate-400 flex flex-col items-center gap-1">
          <span class="text-xl">🔊</span>
          <span class="text-[10px] font-bold">報數</span>
        </button>
        <button id="btnAiAnalyze2" class="text-slate-400 flex flex-col items-center gap-1">
          <span class="text-xl">✨</span>
          <span class="text-[10px] font-bold">AI</span>
        </button>
      </div>

      <!-- Modal -->
      <div id="modal" class="fixed inset-0 bg-white z-[100] hidden flex-col pt-[env(safe-area-inset-top)]">
        <div class="p-4 border-b flex justify-between items-center bg-white sticky top-0 shadow-sm">
          <button id="btnCloseModal" class="text-slate-400 p-2 text-2xl">✕</button>
          <h3 id="modalTitle" class="font-black text-lg"></h3>
          <button id="btnSaveModal" class="text-sky-500 font-black px-4 py-2 bg-sky-50 rounded-xl active:scale-95 transition-transform">完成</button>
        </div>

        <div class="flex-1 overflow-y-auto p-6 space-y-8 pb-12 bg-slate-50/50">
          <div id="modalBody" class="space-y-8"></div>
        </div>
      </div>
    </div>
  `;

  renderCalendarGrid();
  bindEvents();
}

function statCard(label, value, bgClass, icon) {
  return `
    <div class="${bgClass} rounded-3xl p-5 text-white shadow-sm flex flex-col justify-between h-28">
      <div class="bg-white/20 w-fit px-3 py-2 rounded-xl font-black">${icon}</div>
      <div>
        <p class="text-[10px] font-black opacity-70 uppercase tracking-widest">${label}</p>
        <p class="text-xl font-black tracking-tight truncate">${value}</p>
      </div>
    </div>
  `;
}

function renderCalendarGrid() {
  const grid = document.getElementById("calGrid");
  if (!grid) return;

  const y = currentDate.getFullYear();
  const m = currentDate.getMonth(); // 0-based
  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  // empty slots
  const empty = Array.from({ length: firstDay }).map(() => `<div></div>`).join("");

  // days
  const daysHtml = Array.from({ length: daysInMonth }).map((_, i) => {
    const day = i + 1;
    const key = dateKey(y, m + 1, day);
    const hasData = (allRecords[key] || []).some(r => r && r.name);

    const cls = hasData
      ? "bg-sky-500 text-white shadow-md"
      : "bg-slate-50 text-slate-400";

    return `
      <button
        class="calDay aspect-square rounded-2xl flex flex-col items-center justify-center transition-all active:scale-90 ${cls}"
        data-day="${day}"
      >
        <span class="text-sm font-black">${day}</span>
        ${hasData ? `<div class="w-1 h-1 rounded-full bg-white/60 mt-1"></div>` : `<div class="w-1 h-1 mt-1"></div>`}
      </button>
    `;
  }).join("");

  grid.innerHTML = empty + daysHtml;
}

// =========================
// Modal (edit day)
// =========================
function openModal(day) {
  selectedDay = day;
  const y = currentDate.getFullYear();
  const m = currentDate.getMonth() + 1;
  const key = dateKey(y, m, day);

  const modal = document.getElementById("modal");
  const title = document.getElementById("modalTitle");
  const body = document.getElementById("modalBody");

  title.textContent = `${m}/${day} 記錄`;

  const dayData = allRecords[key] || [{}, {}];
  const safe = [dayData[0] || {}, dayData[1] || {}];

  body.innerHTML = safe.map((d, idx) => renderDrinkCard(key, idx, d)).join("");

  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

function closeModal() {
  const modal = document.getElementById("modal");
  modal.classList.add("hidden");
  modal.classList.remove("flex");
  selectedDay = null;
}

function renderDrinkCard(key, idx, data) {
  const shop = data.shop || "";
  const name = data.name || "";
  const price = data.price || "";
  const ice = data.ice || "";
  const sugar = data.sugar || "";

  return `
    <div class="bg-white rounded-[2rem] p-6 space-y-6 shadow-sm border border-slate-100" data-key="${key}" data-idx="${idx}">
      <div class="flex justify-between items-center">
        <span class="text-[10px] font-black bg-slate-50 px-3 py-1 rounded-full text-slate-400 uppercase tracking-widest">Drink ${idx + 1}</span>
        <button class="btnClear text-slate-200 active:text-red-400 transition-colors text-xl" title="清空">🗑️</button>
      </div>

      <div class="space-y-4">
        <div class="space-y-1">
          <label class="text-[10px] font-black text-slate-300 uppercase px-2">飲料店</label>
          <input class="inpShop w-full bg-slate-50 p-4 rounded-2xl font-bold shadow-inner outline-none" placeholder="店名..." value="${escapeHtml(shop)}" />
        </div>

        <div class="space-y-1">
          <label class="text-[10px] font-black text-slate-300 uppercase px-2">品項</label>
          <input class="inpName w-full bg-slate-50 p-4 rounded-2xl font-bold shadow-inner outline-none" placeholder="品項名稱..." value="${escapeHtml(name)}" />
        </div>

        <div class="space-y-1">
          <label class="text-[10px] font-black text-slate-300 uppercase px-2">價格</label>
          <input class="inpPrice w-full bg-slate-50 p-4 rounded-2xl font-bold shadow-inner outline-none" type="number" placeholder="0" value="${escapeHtml(String(price))}" />
        </div>

        <div class="space-y-2">
          <label class="text-[10px] font-black text-slate-300 uppercase px-2">甜度</label>
          <div class="grid grid-cols-3 gap-2">
            ${SUGAR_LEVELS.slice(0,6).map(s => btnChip("sugar", s, sugar === s)).join("")}
          </div>
        </div>

        <div class="space-y-2">
          <label class="text-[10px] font-black text-slate-300 uppercase px-2">冰塊</label>
          <div class="grid grid-cols-3 gap-2">
            ${ICE_LEVELS.map(v => btnChip("ice", v, ice === v)).join("")}
          </div>
        </div>
      </div>
    </div>
  `;
}

function btnChip(type, value, active) {
  return `
    <button class="chip py-3 rounded-xl text-xs font-black transition-all ${active ? "bg-sky-500 text-white shadow-md" : "bg-slate-50 text-slate-400"}"
      data-chip-type="${type}" data-chip-value="${escapeHtml(value)}">
      ${escapeHtml(value)}
    </button>
  `;
}

function escapeHtml(str) {
  return (str || "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

// =========================
// AI
// =========================
async function runAiAnalyze() {
  const key = getGeminiKey();
  const aiBox = document.getElementById("aiBox");
  const aiText = document.getElementById("aiText");
  aiBox.classList.remove("hidden");
  aiText.textContent = "AI 分析中…";

  if (!key) {
    aiText.textContent = "你還沒設定 Gemini API Key。\n點右上「設定 Key」貼上一次即可（只存你手機本機，不會上傳 GitHub）。";
    return;
  }

  const stats = calcStats();
  const recent = stats.rawHistory.slice(-10)
    .map(d => `${d.shop || "未知店家"} 的 ${d.name || "未知品項"}（${d.sugar || "甜度未填"}, ${d.ice || "冰量未填"}）`)
    .join("、");

  const prompt =
`我最近喝了這些手搖飲：${recent || "尚未記錄"}。
請你：
1) 分析我的口味偏好（茶/奶/果、甜度、冰量）
2) 給我一個「今日推薦組合」：店家 + 具體品項 + 甜度 + 冰塊 + 加料建議
3) 給我一小段幽默但務實的健康叮嚀
請用繁體中文，語氣像資深飲料店店長。`;

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      }
    );

    const json = await resp.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;

    aiText.textContent = text || "AI 回傳是空的（通常是 Key / 權限 / 模型限制）。";
  } catch (e) {
    console.error(e);
    aiText.textContent = "AI 休息中（請確認 Key 正確、網路正常）。";
  }
}

function speakStats() {
  const s = calcStats();
  const text = `店長報數時間！你今年已經喝了 ${s.totalCups} 杯，總共花了 ${s.totalCost} 元，平均一杯 ${s.avgPrice} 元。最愛店家是 ${s.favoriteStore}，最愛品項是 ${s.favoriteItem}。喝飲料也要記得喝水！`;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-TW";
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch (e) {
    alert("這台裝置不支援語音播報。");
  }
}

function promptSetKey() {
  const current = getGeminiKey();
  const input = prompt("貼上你的 Gemini API Key（只存本機，不會上傳 GitHub）", current);
  if (input === null) return;
  setGeminiKey(input);
  alert(getGeminiKey() ? "已設定完成 ✅" : "已清除 Key");
}

// =========================
// Events / Bind
// =========================
function bindEvents() {
  // month nav
  document.getElementById("btnPrevMonth").onclick = () => {
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    renderApp();
  };
  document.getElementById("btnNextMonth").onclick = () => {
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    renderApp();
  };

  // open day modal
  document.querySelectorAll(".calDay").forEach(btn => {
    btn.onclick = () => openModal(Number(btn.dataset.day));
  });

  // quick today
  document.getElementById("btnQuickToday").onclick = () => {
    const today = new Date();
    currentDate = new Date(2026, today.getMonth(), 1);
    openModal(today.getDate());
  };

  // modal buttons
  document.getElementById("btnCloseModal").onclick = closeModal;
  document.getElementById("btnSaveModal").onclick = async () => {
    await saveToCloud(allRecords);
    closeModal();
    renderApp();
  };

  // modal inputs (delegate)
  const modalBody = document.getElementById("modalBody");
  modalBody.onclick = async (e) => {
    const card = e.target.closest("[data-key][data-idx]");
    if (!card) return;

    const key = card.dataset.key;
    const idx = Number(card.dataset.idx);

    // clear
    if (e.target.classList.contains("btnClear")) {
      ensureDay(key);
      allRecords[key][idx] = {};
      await saveToCloud(allRecords);
      openModal(selectedDay);
      return;
    }

    // chip
    if (e.target.classList.contains("chip")) {
      const type = e.target.dataset.chipType;
      const value = e.target.dataset.chipValue;
      ensureDay(key);
      allRecords[key][idx] = { ...(allRecords[key][idx] || {}), [type]: value };
      // 即時存（穩）
      await saveToCloud(allRecords);
      openModal(selectedDay);
      return;
    }
  };

  modalBody.oninput = async (e) => {
    const card = e.target.closest("[data-key][data-idx]");
    if (!card) return;

    const key = card.dataset.key;
    const idx = Number(card.dataset.idx);
    ensureDay(key);

    if (e.target.classList.contains("inpShop")) {
      allRecords[key][idx] = { ...(allRecords[key][idx] || {}), shop: e.target.value };
    }
    if (e.target.classList.contains("inpName")) {
      allRecords[key][idx] = { ...(allRecords[key][idx] || {}), name: e.target.value };
    }
    if (e.target.classList.contains("inpPrice")) {
      allRecords[key][idx] = { ...(allRecords[key][idx] || {}), price: e.target.value };
    }
    // 不要每打一個字就寫雲端（成本高）；等按完成或換 chip 再存
  };

  // AI
  document.getElementById("btnAiAnalyze").onclick = runAiAnalyze;
  document.getElementById("btnAiAnalyze2").onclick = runAiAnalyze;
  document.getElementById("btnSpeak").onclick = speakStats;
  document.getElementById("btnSpeak2").onclick = speakStats;
  document.getElementById("btnSetKey").onclick = promptSetKey;
}

function ensureDay(key) {
  if (!allRecords[key]) allRecords[key] = [{}, {}];
  if (!allRecords[key][0]) allRecords[key][0] = {};
  if (!allRecords[key][1]) allRecords[key][1] = {};
}

// =========================
// Auth + Firestore subscribe
// =========================
async function boot() {
  renderLoading();

  // Auth
  await signInAnonymously(auth);
  onAuthStateChanged(auth, (u) => {
    user = u;
    if (!user) return;

    // Firestore listen
    onSnapshot(userDocRef(user.uid), (snap) => {
      if (snap.exists()) {
        allRecords = snap.data()?.data || {};
      }
      renderApp();
      registerSW();
    }, (err) => {
      console.error(err);
      renderApp();
      registerSW();
    });
  });
}

function renderLoading() {
  const root = document.getElementById("app");
  root.innerHTML = `
    <div class="min-h-screen flex items-center justify-center bg-sky-50">
      <div class="text-sky-500 animate-pulse flex flex-col items-center">
        <div class="text-5xl">🥤</div>
        <div class="mt-4 font-black text-sky-500">開啟手搖日誌中...</div>
      </div>
    </div>
  `;
}

// =========================
// Service Worker (optional)
// =========================
function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js").catch(()=>{});
}

// GO
boot();
