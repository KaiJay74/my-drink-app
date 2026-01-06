import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/** ✅ 你的 Firebase 設定（已整合） */
const firebaseConfig = {
  apiKey: "AIzaSyDMO5K4TXeUu89rSIA6yDo6LfvUcn_4O5s",
  authDomain: "my-drink-app-aef39.firebaseapp.com",
  projectId: "my-drink-app-aef39",
  storageBucket: "my-drink-app-aef39.firebasestorage.app",
  messagingSenderId: "871859123960",
  appId: "1:871859123960:web:21cb457ac63ae82fe9ad0d",
  measurementId: "G-6FH8VQWX8V"
};

/** App 路徑用（可改名，不影響 Firebase 專案） */
const APP_ID = "my-drink-app";

/** options */
const ICE_LEVELS = ["正常", "少冰", "微冰", "去冰", "常溫", "熱"];
const SUGAR_LEVELS = ["全糖", "少糖", "半糖", "微糖", "一分糖", "無糖"];

// ✅ 你要求的加料（含常見同義）
const TOPPINGS = [
  "珍珠",
  "波霸",
  "粉圓",
  "粉角",
  "粉粿",
  "仙草",
  "芋圓",
  "雙Q",
  "茶凍",
  "布丁",
  "冰淇淋"
];

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const MONTHS = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];

/** Firebase */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/** State */
let user = null;
let allRecords = {}; // { "YYYY-M-D": [ {shop,name,price,ice,sugar,toppings:[]}, {...} ] }
let current = new Date(2026, 0, 1);
let selectedDay = null;

/** DOM helpers */
const $ = (id) => document.getElementById(id);

function el(tag, className = "", text = "") {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== "") n.textContent = text;
  return n;
}

function dateKey(year, monthIdx, day) {
  return `${year}-${monthIdx + 1}-${day}`;
}

function ensureTwoSlots(key) {
  if (!allRecords[key]) allRecords[key] = [{}, {}];
  if (!Array.isArray(allRecords[key])) allRecords[key] = [{}, {}];
  if (allRecords[key].length < 2) allRecords[key] = [allRecords[key][0] || {}, allRecords[key][1] || {}];
}

function flattenHistory() {
  return Object.values(allRecords).flat().filter((r) => r && r.name);
}

function computeStats() {
  const data = flattenHistory();
  const totalCups = data.length;
  const totalCost = data.reduce((sum, it) => sum + (Number(it.price) || 0), 0);
  const avgPrice = totalCups ? Math.round(totalCost / totalCups) : 0;

  const storeCounts = {};
  const itemCounts = {};
  for (const d of data) {
    if (d.shop) storeCounts[d.shop] = (storeCounts[d.shop] || 0) + 1;
    if (d.name) itemCounts[d.name] = (itemCounts[d.name] || 0) + 1;
  }

  const favoriteStore = Object.entries(storeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "無";
  const favoriteItem = Object.entries(itemCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "無";

  $("statCups").textContent = `${totalCups}`;
  $("statCost").textContent = `${totalCost}`;
  $("statAvg").textContent = `${avgPrice}`;
  $("statFavStore").textContent = favoriteStore;
  $("statFavItem").textContent = favoriteItem;
}

async function saveToCloud() {
  if (!user) return;
  $("saveStatus").textContent = "儲存中...";
  try {
    const ref = doc(db, "artifacts", APP_ID, "users", user.uid, "records", "yearly2026");
    await setDoc(ref, { data: allRecords, lastUpdated: new Date().toISOString() });
    $("saveStatus").textContent = "已安全儲存";
    setTimeout(() => ($("saveStatus").textContent = ""), 1200);
  } catch (e) {
    $("saveStatus").textContent = "儲存失敗";
    console.error(e);
  }
}

function mountShell() {
  const root = $("app");
  root.innerHTML = "";

  const page = el("div", "min-h-screen bg-gradient-to-b from-sky-400 via-sky-100 to-white pb-12 font-sans");

  /** Top bar */
  const top = el("div", "bg-white/90 sticky top-0 z-40 backdrop-blur-md shadow-sm px-6 py-3 flex justify-between items-center");
  const brand = el("div", "flex items-center gap-2 text-sky-600 font-black text-xl");
  brand.innerHTML = `<i data-lucide="cup-soda" class="w-6 h-6"></i> 我超愛喝手搖`;

  const topRight = el("div", "flex items-center gap-4");
  const saveStatus = el("span", "text-xs font-bold text-sky-400");
  saveStatus.id = "saveStatus";

  const btnQuick = el(
    "button",
    "bg-sky-500 hover:bg-sky-600 text-white px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2 shadow-lg shadow-sky-200 transition-all active:scale-95"
  );
  btnQuick.id = "btnQuick";
  btnQuick.innerHTML = `<i data-lucide="zap" class="w-4 h-4"></i> 快速紀錄今天`;

  topRight.appendChild(saveStatus);
  topRight.appendChild(btnQuick);
  top.appendChild(brand);
  top.appendChild(topRight);

  /** Content */
  const container = el("div", "max-w-6xl mx-auto px-4 mt-8 space-y-8");
  const statsGrid = el("div", "grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4");
  statsGrid.appendChild(statMiniCard("cup-soda", "年度杯數", "statCups", "杯"));
  statsGrid.appendChild(statMiniCard("wallet", "年度總支出", "statCost", "元"));
  statsGrid.appendChild(statMiniCard("trending-up", "平均單價", "statAvg", "元"));
  statsGrid.appendChild(statMiniCard("store", "最愛店家", "statFavStore", ""));
  statsGrid.appendChild(statMiniCard("plus", "最愛品項", "statFavItem", ""));

  container.appendChild(statsGrid);

  /** AI Card */
  const aiCard = el("div", "bg-gradient-to-r from-sky-600 to-blue-500 rounded-[2.5rem] p-6 md:p-8 text-white shadow-xl relative overflow-hidden");
  aiCard.innerHTML = `
    <div class="absolute top-0 right-0 p-8 opacity-10">
      <i data-lucide="brain-circuit" class="w-28 h-28"></i>
    </div>
    <div class="relative z-10">
      <div class="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div>
          <div class="text-2xl font-black flex items-center gap-2">
            <i data-lucide="sparkles" class="w-6 h-6 text-amber-300"></i> ✨ AI 飲品大師
          </div>
          <div class="text-sky-100 font-medium mt-1">基於你的飲用紀錄為你提供專屬建議</div>
        </div>
        <div class="flex gap-2 w-full sm:w-auto">
          <button id="btnAiAnalyze"
            class="flex-1 sm:flex-none bg-white/20 hover:bg-white/30 px-5 py-2 rounded-full font-black flex items-center justify-center gap-2 transition-all border border-white/30 backdrop-blur-sm active:scale-95">
            <i data-lucide="sparkles" class="w-4 h-4"></i> 分析推薦
          </button>
          <button id="btnAiReport"
            class="flex-1 sm:flex-none bg-amber-400 hover:bg-amber-500 text-sky-900 px-5 py-2 rounded-full font-black flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95">
            <i data-lucide="volume-2" class="w-4 h-4"></i> 報數聽聽看
          </button>
        </div>
      </div>

      <div id="aiBox" class="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/20">
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <div class="font-bold text-sky-100">AI Key（可選）：</div>
          <div class="flex gap-2 w-full sm:w-auto">
            <input id="aiKeyInput" placeholder="貼上 Gemini API Key（存在本機）"
              class="flex-1 sm:w-[340px] bg-white/15 border border-white/25 rounded-xl px-4 py-2 text-white placeholder:text-white/60 outline-none"/>
            <button id="btnAiSaveKey"
              class="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-xl font-black border border-white/30 active:scale-95">
              儲存
            </button>
          </div>
        </div>
        <div id="aiResult" class="mt-4 whitespace-pre-wrap leading-relaxed font-medium text-white/95">
點擊「分析推薦」讓 AI 幫你看看喝得健不健康！
        </div>
      </div>
    </div>
  `;
  container.appendChild(aiCard);

  /** Calendar card */
  const calCard = el("div", "bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-white");
  const calHeader = el("div", "bg-sky-500 p-8 flex items-center justify-between text-white");
  const btnPrev = el("button", "p-2 hover:bg-white/20 rounded-full transition-colors");
  btnPrev.id = "btnPrev";
  btnPrev.innerHTML = `<i data-lucide="chevron-left" class="w-8 h-8"></i>`;

  const mid = el("div", "text-center");
  const monthTitle = el("h2", "text-3xl font-black");
  monthTitle.id = "monthTitle";
  const yearTitle = el("p", "opacity-80 font-bold");
  yearTitle.id = "yearTitle";
  mid.appendChild(monthTitle);
  mid.appendChild(yearTitle);

  const btnNext = el("button", "p-2 hover:bg-white/20 rounded-full transition-colors");
  btnNext.id = "btnNext";
  btnNext.innerHTML = `<i data-lucide="chevron-right" class="w-8 h-8"></i>`;

  calHeader.appendChild(btnPrev);
  calHeader.appendChild(mid);
  calHeader.appendChild(btnNext);

  const calBody = el("div", "p-6 md:p-10");
  const weekRow = el("div", "grid grid-cols-7 mb-6 text-sky-300 font-black text-center uppercase tracking-widest text-sm");
  WEEKDAYS.forEach((d) => weekRow.appendChild(el("div", "", d)));

  const grid = el("div", "grid grid-cols-7 gap-3");
  grid.id = "calendarGrid";

  calBody.appendChild(weekRow);
  calBody.appendChild(grid);

  calCard.appendChild(calHeader);
  calCard.appendChild(calBody);

  container.appendChild(calCard);

  /** Modal */
  const modal = el("div", "hidden fixed inset-0 bg-sky-900/80 backdrop-blur-md z-50 items-center justify-center p-4");
  modal.id = "modal";

  modal.innerHTML = `
    <div class="bg-white rounded-[3rem] w-full max-w-5xl max-h-[90vh] overflow-y-auto shadow-2xl relative">
      <div class="sticky top-0 bg-white/80 backdrop-blur-md px-8 py-6 flex justify-between items-center border-b border-sky-50 z-20">
        <h3 id="modalTitle" class="text-2xl font-black text-sky-600 flex items-center gap-3"></h3>
        <div class="flex gap-4">
          <button id="btnClose" class="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
            <i data-lucide="x" class="w-7 h-7"></i>
          </button>
          <button id="btnSave"
            class="bg-sky-500 hover:bg-sky-600 text-white px-10 py-3 rounded-full font-black flex items-center gap-2 shadow-xl shadow-sky-200 transition-all active:scale-95">
            <i data-lucide="save" class="w-5 h-5"></i> 儲存紀錄
          </button>
        </div>
      </div>

      <div id="modalBody" class="p-8 grid grid-cols-1 lg:grid-cols-2 gap-8"></div>
    </div>
  `;

  page.appendChild(top);
  page.appendChild(container);
  page.appendChild(modal);
  root.appendChild(page);

  /** Bind */
  $("btnPrev").addEventListener("click", () => {
    current = new Date(current.getFullYear(), current.getMonth() - 1, 1);
    renderCalendar();
  });
  $("btnNext").addEventListener("click", () => {
    current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    renderCalendar();
  });

  $("btnClose").addEventListener("click", closeModal);

  $("btnSave").addEventListener("click", async () => {
    await saveToCloud();
    renderCalendar();
    closeModal();
  });

  $("btnQuick").addEventListener("click", () => {
    const today = new Date();
    current = new Date(2026, today.getMonth(), 1);
    renderCalendar();
    openModal(today.getDate());
  });

  // AI key: local storage
  const savedKey = localStorage.getItem("GEMINI_API_KEY") || "";
  $("aiKeyInput").value = savedKey;
  $("btnAiSaveKey").addEventListener("click", () => {
    localStorage.setItem("GEMINI_API_KEY", $("aiKeyInput").value.trim());
    toastAi("已儲存（存在本機瀏覽器）");
  });

  $("btnAiReport").addEventListener("click", () => speakStats());
  $("btnAiAnalyze").addEventListener("click", () => getAiInsight());

  lucide.createIcons();
}

function toastAi(msg) {
  const box = $("aiResult");
  box.textContent = msg;
}

function statMiniCard(iconName, label, valueId, unit) {
  const card = el("div", "bg-white/80 backdrop-blur rounded-[2rem] p-5 shadow-lg border border-white flex items-center gap-4");
  card.innerHTML = `
    <div class="p-3 bg-sky-100 rounded-2xl text-sky-500">
      <i data-lucide="${iconName}" class="w-6 h-6"></i>
    </div>
    <div class="min-w-0">
      <p class="text-[10px] font-black text-slate-400 uppercase tracking-tighter">${label}</p>
      <p id="${valueId}" class="text-lg font-black text-slate-700 truncate max-w-[180px]">-</p>
      ${unit ? `<p class="hidden" aria-hidden="true">${unit}</p>` : ``}
    </div>
  `;
  // show unit inline by concatenation in computeStats (we do numbers only, so keep UI clean)
  // We'll show unit by label only; you can change to `value + unit`.
  return card;
}

function renderCalendar() {
  const y = current.getFullYear();
  const m = current.getMonth();
  $("monthTitle").textContent = MONTHS[m];
  $("yearTitle").textContent = y;

  const grid = $("calendarGrid");
  grid.innerHTML = "";

  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  for (let i = 0; i < firstDay; i++) {
    const div = el("div", "aspect-square");
    grid.appendChild(div);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const key = dateKey(y, m, d);
    const hasData = (allRecords[key] || []).some((r) => r && r.name);

    const btn = el(
      "button",
      `aspect-square rounded-3xl border-2 flex flex-col items-center justify-center transition-all relative group
       ${hasData ? "bg-sky-100 border-sky-400 shadow-inner" : "bg-white border-sky-50 hover:border-sky-300 hover:scale-105 shadow-sm"}`
    );

    const num = el("span", `text-xl font-black ${hasData ? "text-sky-600" : "text-slate-300 group-hover:text-sky-400"}`, `${d}`);
    btn.appendChild(num);

    if (hasData) {
      const dots = el("div", "mt-1 flex gap-1");
      const count = allRecords[key].filter((r) => r && r.name).length;
      for (let i = 0; i < count; i++) dots.appendChild(el("div", "w-2 h-2 rounded-full bg-sky-500 animate-pulse"));
      btn.appendChild(dots);
    }

    btn.addEventListener("click", () => openModal(d));
    grid.appendChild(btn);
  }

  computeStats();
  lucide.createIcons();
}

function openModal(day) {
  selectedDay = day;
  const y = current.getFullYear();
  const m = current.getMonth();
  const key = dateKey(y, m, day);

  ensureTwoSlots(key);

  $("modalTitle").innerHTML = `<i data-lucide="calendar" class="w-7 h-7"></i> ${y} / ${m + 1} / ${day}`;

  const body = $("modalBody");
  body.innerHTML = "";

  for (let idx = 0; idx < 2; idx++) {
    const data = allRecords[key][idx] || {};
    const card = el("div", "bg-sky-50/50 rounded-[2.5rem] p-8 border border-sky-100 relative");

    card.innerHTML = `
      <div class="flex justify-between items-center mb-6">
        <span class="bg-white text-sky-600 px-6 py-2 rounded-full text-sm font-black shadow-sm">DRINK NO. ${idx + 1}</span>
        <button type="button" class="btnClear text-slate-300 hover:text-red-500 transition-colors" data-idx="${idx}">
          <i data-lucide="trash-2" class="w-6 h-6"></i>
        </button>
      </div>

      <div class="space-y-6">
        <div class="grid grid-cols-2 gap-4">
          ${inputGroup("店名", "shop", idx, data.shop || "", "例如：迷客夏")}
          ${inputGroup("品項", "name", idx, data.name || "", "例如：珍珠鮮奶")}
        </div>

        ${inputGroup("價格", "price", idx, data.price || "", "0", "number")}

        ${optionSelector("冰塊", "ice", idx, ICE_LEVELS, data.ice || "")}
        ${optionSelector("甜度", "sugar", idx, SUGAR_LEVELS, data.sugar || "")}

        <div>
          <label class="block text-xs font-black text-sky-400 mb-3 uppercase tracking-widest">加料選項（可多選）</label>
          <div class="flex flex-wrap gap-2">
            ${TOPPINGS.map((t) => toppingBtn(t, idx, Array.isArray(data.toppings) ? data.toppings : [])).join("")}
          </div>
        </div>
      </div>
    `;

    body.appendChild(card);
  }

  $("modal").classList.remove("hidden");
  $("modal").classList.add("flex");

  wireModalEvents(key);
  lucide.createIcons();
}

function closeModal() {
  $("modal").classList.add("hidden");
  $("modal").classList.remove("flex");
  selectedDay = null;
}

function inputGroup(label, field, idx, value, placeholder, type = "text") {
  return `
    <div>
      <label class="block text-xs font-black text-sky-400 mb-2 uppercase tracking-widest">${label}</label>
      <input
        data-field="${field}" data-idx="${idx}" type="${type}"
        class="w-full bg-white border-2 border-transparent focus:border-sky-200 rounded-2xl px-4 py-3 text-slate-700 font-bold outline-none transition-all placeholder:text-slate-200 shadow-sm"
        placeholder="${placeholder}"
        value="${escapeHtml(value)}"
      />
    </div>
  `;
}

function optionSelector(label, field, idx, options, selected) {
  return `
    <div class="optBlock" data-field="${field}" data-idx="${idx}">
      <label class="block text-xs font-black text-sky-400 mb-3 uppercase tracking-widest">${label}</label>
      <div class="grid grid-cols-3 gap-2">
        ${options
          .map(
            (opt) => `
          <button type="button"
            data-opt="${opt}"
            class="optBtn py-2 rounded-xl text-xs font-bold transition-all ${
              selected === opt
                ? "bg-sky-500 text-white shadow-lg"
                : "bg-white text-slate-400 hover:border-sky-200 border-2 border-transparent"
            }">
            ${opt}
          </button>
        `
          )
          .join("")}
      </div>
    </div>
  `;
}

function toppingBtn(name, idx, selectedList) {
  const on = selectedList.includes(name);
  return `
    <button type="button" data-topping="${name}" data-idx="${idx}"
      class="toppingBtn px-4 py-2 rounded-2xl text-sm font-bold transition-all ${
        on ? "bg-sky-500 text-white" : "bg-white text-slate-400 hover:bg-sky-100"
      }">
      ${name}
    </button>
  `;
}

/**
 * ✅ 這裡是關鍵：不再 openModal() 重渲染（修「卡一下回主畫面」）
 * 改成：
 * - input：即時更新
 * - ice/sugar：只切換按鈕 class + 更新資料
 * - toppings：只切換單顆 class + 更新資料
 */
function wireModalEvents(key) {
  const modalBody = $("modalBody");

  // inputs
  modalBody.querySelectorAll("input[data-field]").forEach((inp) => {
    inp.addEventListener("input", (e) => {
      const field = e.target.dataset.field;
      const idx = Number(e.target.dataset.idx);
      ensureTwoSlots(key);
      allRecords[key][idx] = { ...(allRecords[key][idx] || {}), [field]: e.target.value };
    });
  });

  // option blocks (event delegation)
  modalBody.querySelectorAll(".optBlock").forEach((block) => {
    const field = block.dataset.field;
    const idx = Number(block.dataset.idx);

    block.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-opt]");
      if (!btn) return;

      const opt = btn.dataset.opt;
      ensureTwoSlots(key);
      allRecords[key][idx] = { ...(allRecords[key][idx] || {}), [field]: opt };

      // UI: reset siblings
      block.querySelectorAll("button[data-opt]").forEach((b) => {
        b.classList.remove("bg-sky-500", "text-white", "shadow-lg");
        b.classList.add("bg-white", "text-slate-400");
        b.classList.add("border-2", "border-transparent");
      });

      // UI: set selected
      btn.classList.remove("bg-white", "text-slate-400", "border-2", "border-transparent");
      btn.classList.add("bg-sky-500", "text-white", "shadow-lg");
    });
  });

  // toppings
  modalBody.querySelectorAll("button[data-topping]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.idx);
      const t = btn.dataset.topping;

      ensureTwoSlots(key);
      const cur = allRecords[key][idx] || {};
      const list = Array.isArray(cur.toppings) ? cur.toppings : [];
      const next = list.includes(t) ? list.filter((x) => x !== t) : [...list, t];
      allRecords[key][idx] = { ...cur, toppings: next };

      // UI toggle
      const on = next.includes(t);
      btn.classList.toggle("bg-sky-500", on);
      btn.classList.toggle("text-white", on);
      btn.classList.toggle("bg-white", !on);
      btn.classList.toggle("text-slate-400", !on);
      btn.classList.toggle("hover:bg-sky-100", !on);
    });
  });

  // clear
  modalBody.querySelectorAll(".btnClear").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.idx);
      ensureTwoSlots(key);
      allRecords[key][idx] = {};
      // 直接刷新 modal UI（只清一次不會卡頓）
      openModal(selectedDay);
      saveToCloud();
      renderCalendar();
    });
  });
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/** ========= AI (Gemini) =========
 * 前端直連版本：可用但 API Key 無法真正保密（GitHub Pages 的限制）
 */
async function getAiInsight() {
  const apiKey = (localStorage.getItem("GEMINI_API_KEY") || "").trim();
  if (!apiKey) {
    toastAi("請先貼上 Gemini API Key（只存你本機瀏覽器）再按分析。");
    return;
  }

  const data = flattenHistory();
  const recent = data.slice(-10).map((d) => `${d.shop || "?"} 的 ${d.name || "?"}（${d.sugar || "?"}, ${d.ice || "?"}，加料：${(d.toppings || []).join("、") || "無"}）`).join("\n");

  const prompt = `我最近喝了這些手搖飲（新→舊）：
${recent || "尚未記錄"}

請你：
1) 分析口味偏好（茶/奶/甜度/冰塊/加料）
2) 給我「今日推薦組合」：台灣常見店家 + 具體品項 + 甜度冰塊 + 加料（若需要）
3) 用一句幽默但不酸的健康叮嚀

用繁體中文、語氣像資深飲料店店長。`;

  toastAi("AI 分析中…");

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      }
    );

    const json = await resp.json();
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    toastAi(text || "AI 回覆是空的（可能是 key/配額/模型限制）。");
  } catch (e) {
    console.error(e);
    toastAi("AI 連線失敗，請稍後再試或確認 API Key/網路。");
  }
}

/** 語音報數（不需要 AI key） */
function speakStats() {
  const data = flattenHistory();
  const total = data.length;
  const totalCost = data.reduce((s, it) => s + (Number(it.price) || 0), 0);
  const avg = total ? Math.round(totalCost / total) : 0;

  const text = `店長報數時間！你在 2026 年已經喝了 ${total} 杯飲料，總共花了 ${totalCost} 元，平均一杯 ${avg} 元。喝飲料也要記得喝水喔！`;

  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-TW";
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    toastAi(text);
  } catch {
    toastAi(text);
  }
}

/** ========= Start ========= */
function showLoading() {
  $("app").innerHTML = `
    <div class="flex h-screen items-center justify-center bg-sky-50">
      <div class="text-sky-500 animate-bounce flex flex-col items-center">
        <i data-lucide="cup-soda" class="w-12 h-12"></i>
        <span class="mt-4 font-black">開啟手搖日誌中...</span>
      </div>
    </div>
  `;
  lucide.createIcons();
}

async function start() {
  showLoading();
  mountShell();

  await signInAnonymously(auth);

  onAuthStateChanged(auth, (u) => {
    user = u;
    if (!user) return;

    const ref = doc(db, "artifacts", APP_ID, "users", user.uid, "records", "yearly2026");
    onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) allRecords = snap.data().data || {};
        renderCalendar();
        $("saveStatus").textContent = "";
      },
      (err) => {
        console.error("onSnapshot error:", err);
        renderCalendar();
      }
    );
  });
}

start();
