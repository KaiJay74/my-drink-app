import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/** ✅ Firebase 設定（你提供的） */
const firebaseConfig = {
  apiKey: "AIzaSyDMO5K4TXeUu89rSIA6yDo6LfvUcn_4O5s",
  authDomain: "my-drink-app-aef39.firebaseapp.com",
  projectId: "my-drink-app-aef39",
  storageBucket: "my-drink-app-aef39.firebasestorage.app",
  messagingSenderId: "871859123960",
  appId: "1:871859123960:web:21cb457ac63ae82fe9ad0d",
  measurementId: "G-6FH8VQWX8V",
};

// App 路徑用（不影響 Firebase 專案）
const APP_ID = "drink-tracker-2026";

// 選項
const ICE_LEVELS = ["正常", "少冰", "微冰", "去冰", "常溫", "溫"];
const SUGAR_LEVELS = ["全糖", "少糖", "半糖", "微糖", "一分糖", "無糖"];
const TOPPINGS = ["珍珠", "粉圓", "仙草", "芋圓", "粉角", "粉粿", "波霸", "布丁", "冰淇淋", "雙Q", "茶凍"];
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const MONTHS = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];

// Firebase init
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// State
let user = null;
let allRecords = {};
let current = new Date(2026, 0, 1);
let selectedDay = null;

// DOM helpers
const $ = (sel) => document.querySelector(sel);
const el = (tag, className = "", html = "") => {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (html !== undefined && html !== null) n.innerHTML = html;
  return n;
};

function keyOf(y, mIdx, d) {
  return `${y}-${mIdx + 1}-${d}`;
}

function ensureTwoSlots(k) {
  if (!allRecords[k]) allRecords[k] = [{}, {}];
  if (!Array.isArray(allRecords[k])) allRecords[k] = [{}, {}];
  if (allRecords[k].length < 2) allRecords[k] = [allRecords[k][0] || {}, allRecords[k][1] || {}];
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

  $("#statCups").textContent = totalCups;
  $("#statCost").textContent = totalCost;
  $("#statAvg").textContent = avgPrice;
  $("#statFavStore").textContent = favoriteStore;
  $("#statFavItem").textContent = favoriteItem;
}

function setStatus(text) {
  $("#saveStatus").textContent = text || "";
}

// debounce save (避免一直打 Firestore)
let saveTimer = null;
function scheduleSave(ms = 900) {
  if (!user) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveToCloud(), ms);
}

async function saveToCloud() {
  if (!user) return;
  setStatus("儲存中...");
  try {
    const ref = doc(db, "artifacts", APP_ID, "users", user.uid, "records", "yearly2026");
    await setDoc(ref, { data: allRecords, lastUpdated: new Date().toISOString() });
    setStatus("已安全儲存");
    setTimeout(() => setStatus(""), 1200);
  } catch (e) {
    console.error(e);
    setStatus("儲存失敗");
  }
}

/** ---------------- UI: Shell ---------------- */
function mountShell() {
  const root = $("#app");
  root.innerHTML = "";

  const header = el(
    "div",
    "bg-white/90 sticky top-0 z-40 backdrop-blur-md shadow-sm px-6 py-3 flex justify-between items-center"
  );
  header.innerHTML = `
    <div class="flex items-center gap-2 text-sky-600 font-black text-xl">
      <i data-lucide="cup-soda"></i> 我超愛喝手搖
    </div>
    <div class="flex items-center gap-4">
      <span id="saveStatus" class="text-xs font-bold text-sky-400"></span>
      <button id="btnQuick"
        class="bg-sky-500 hover:bg-sky-600 text-white px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2 shadow-lg shadow-sky-200 transition-all active:scale-95">
        <i data-lucide="zap" class="w-4 h-4"></i> 快速紀錄今天
      </button>
    </div>
  `;

  const container = el("div", "min-h-screen bg-gradient-to-b from-sky-400 via-sky-100 to-white pb-12");
  const inner = el("div", "max-w-6xl mx-auto px-4 mt-8 space-y-8");
  container.appendChild(header);
  container.appendChild(inner);

  // stats
  const statsGrid = el("div", "grid grid-cols-2 md:grid-cols-5 gap-4");
  statsGrid.innerHTML = `
    ${statMiniCard("cup-soda", "年度杯數", `<span id="statCups">0</span>杯`)}
    ${statMiniCard("wallet", "年度總支出", `<span id="statCost">0</span>元`)}
    ${statMiniCard("trending-up", "平均單價", `<span id="statAvg">0</span>元`)}
    ${statMiniCard("store", "最愛店家", `<span id="statFavStore">無</span>`)}
    ${statMiniCard("plus", "最愛品項", `<span id="statFavItem">無</span>`)}
  `;
  inner.appendChild(statsGrid);

  // calendar card
  const calCard = el("div", "bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-white");
  calCard.innerHTML = `
    <div class="bg-sky-500 p-8 flex items-center justify-between text-white">
      <button id="btnPrev" class="p-2 hover:bg-white/20 rounded-full transition-colors">
        <i data-lucide="chevron-left" class="w-8 h-8"></i>
      </button>
      <div class="text-center">
        <h2 id="monthTitle" class="text-3xl font-black">一月</h2>
        <p id="yearTitle" class="opacity-80 font-bold">2026</p>
      </div>
      <button id="btnNext" class="p-2 hover:bg-white/20 rounded-full transition-colors">
        <i data-lucide="chevron-right" class="w-8 h-8"></i>
      </button>
    </div>

    <div class="p-6 md:p-10">
      <div class="grid grid-cols-7 mb-6 text-sky-300 font-black text-center uppercase tracking-widest text-sm">
        ${WEEKDAYS.map((d) => `<div>${d}</div>`).join("")}
      </div>

      <div id="calendarGrid" class="grid grid-cols-7 gap-3"></div>
    </div>
  `;
  inner.appendChild(calCard);

  // modal
  const modal = el(
    "div",
    "fixed inset-0 bg-sky-900/80 backdrop-blur-md z-50 hidden items-center justify-center p-4"
  );
  modal.id = "modal";
  modal.innerHTML = `
    <div class="bg-white rounded-[3rem] w-full max-w-5xl max-h-[90vh] overflow-y-auto shadow-2xl relative ios-scroll no-scrollbar">
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
  document.body.appendChild(modal);

  root.appendChild(container);

  // bind static events
  $("#btnPrev").addEventListener("click", () => {
    current = new Date(current.getFullYear(), current.getMonth() - 1, 1);
    renderCalendar();
  });
  $("#btnNext").addEventListener("click", () => {
    current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    renderCalendar();
  });
  $("#btnClose").addEventListener("click", closeModal);
  $("#btnSave").addEventListener("click", async () => {
    await saveToCloud();
    renderCalendar();
    closeModal();
  });
  $("#btnQuick").addEventListener("click", () => {
    const today = new Date();
    current = new Date(2026, today.getMonth(), 1);
    renderCalendar();
    openModal(today.getDate());
  });

  lucide.createIcons();
}

function statMiniCard(icon, label, valueHtml) {
  return `
    <div class="bg-white/80 backdrop-blur rounded-[2rem] p-5 shadow-lg border border-white flex items-center gap-4 group hover:scale-105 transition-transform">
      <div class="p-3 bg-sky-100 rounded-2xl text-sky-500 group-hover:bg-sky-500 group-hover:text-white transition-colors">
        <i data-lucide="${icon}" class="w-5 h-5"></i>
      </div>
      <div>
        <p class="text-[10px] font-black text-slate-400 uppercase tracking-tighter">${label}</p>
        <p class="text-lg font-black text-slate-700 truncate max-w-[140px]">${valueHtml}</p>
      </div>
    </div>
  `;
}

/** ---------------- Calendar ---------------- */
function renderCalendar() {
  const y = current.getFullYear();
  const m = current.getMonth();

  $("#monthTitle").textContent = MONTHS[m];
  $("#yearTitle").textContent = y;

  const grid = $("#calendarGrid");
  grid.innerHTML = "";

  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  // empty slots
  for (let i = 0; i < firstDay; i++) {
    grid.appendChild(el("div", "aspect-square"));
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const k = keyOf(y, m, d);
    const hasData = (allRecords[k] || []).some((r) => r && r.name);

    const btn = el(
      "button",
      `aspect-square rounded-3xl border-2 flex flex-col items-center justify-center transition-all relative group
      ${
        hasData
          ? "bg-sky-100 border-sky-400 shadow-inner"
          : "bg-white border-sky-50 hover:border-sky-300 hover:scale-105 shadow-sm"
      }`
    );

    const num = el(
      "span",
      `text-xl font-black ${hasData ? "text-sky-600" : "text-slate-300 group-hover:text-sky-400"}`,
      d
    );
    btn.appendChild(num);

    if (hasData) {
      const dots = el("div", "mt-1 flex gap-1");
      const count = allRecords[k].filter((r) => r && r.name).length;
      for (let i = 0; i < count; i++) dots.appendChild(el("div", "w-2 h-2 rounded-full bg-sky-500 animate-pulse"));
      btn.appendChild(dots);
    }

    btn.addEventListener("click", () => openModal(d));
    grid.appendChild(btn);
  }

  computeStats();
}

/** ---------------- Modal ---------------- */
function openModal(day) {
  selectedDay = day;
  const y = current.getFullYear();
  const m = current.getMonth();
  const k = keyOf(y, m, day);

  ensureTwoSlots(k);

  $("#modalTitle").innerHTML = `
    <i data-lucide="calendar" class="w-7 h-7"></i>
    ${y} / ${m + 1} / ${day}
  `;

  renderModalBody(k);

  $("#modal").classList.remove("hidden");
  $("#modal").classList.add("flex");
  lucide.createIcons();

  wireModalEvents(k);
}

function closeModal() {
  $("#modal").classList.add("hidden");
  $("#modal").classList.remove("flex");
  selectedDay = null;
}

function renderModalBody(k) {
  const body = $("#modalBody");
  body.innerHTML = "";

  for (let idx = 0; idx < 2; idx++) {
    const data = allRecords[k][idx] || {};
    const toppings = Array.isArray(data.toppings) ? data.toppings : [];

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
          <label class="block text-xs font-black text-sky-400 mb-3 uppercase tracking-widest">加料選項</label>
          <div class="flex flex-wrap gap-2">
            ${TOPPINGS.map((t) => toppingBtn(t, idx, toppings)).join("")}
          </div>
        </div>
      </div>
    `;

    body.appendChild(card);
  }
}

function inputGroup(label, field, idx, value, placeholder, type = "text") {
  return `
    <div>
      <label class="block text-xs font-black text-sky-400 mb-2 uppercase tracking-widest">${label}</label>
      <input
        data-field="${field}" data-idx="${idx}" type="${type}"
        class="w-full bg-white border-2 border-transparent focus:border-sky-200 rounded-2xl px-4 py-3 text-slate-700 font-bold outline-none transition-all placeholder:text-slate-200 shadow-sm"
        placeholder="${escapeHtml(placeholder)}"
        value="${escapeHtml(value)}"
      />
    </div>
  `;
}

function optionSelector(label, field, idx, options, selected) {
  return `
    <div>
      <label class="block text-xs font-black text-sky-400 mb-3 uppercase tracking-widest">${label}</label>
      <div class="grid grid-cols-3 gap-2" data-role="optGrid" data-field="${field}" data-idx="${idx}">
        ${options
          .map((opt) => {
            const on = selected === opt;
            return `
              <button type="button"
                data-role="optBtn" data-field="${field}" data-idx="${idx}" data-opt="${escapeHtml(opt)}"
                class="py-2 rounded-xl text-xs font-bold transition-all border-2
                ${on ? "bg-sky-500 text-white shadow-lg border-sky-500" : "bg-white text-slate-400 hover:border-sky-200 border-transparent"}">
                ${escapeHtml(opt)}
              </button>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function toppingBtn(name, idx, selectedList) {
  const on = selectedList.includes(name);
  return `
    <button type="button" data-role="toppingBtn" data-topping="${escapeHtml(name)}" data-idx="${idx}"
      class="px-4 py-2 rounded-2xl text-sm font-bold transition-all ${
        on ? "bg-sky-500 text-white" : "bg-white text-slate-400 hover:bg-sky-100"
      }">
      ${escapeHtml(name)}
    </button>
  `;
}

/**
 * ✅ 這裡是重點：用「事件委派」更新 UI
 * 不再 openModal() 重畫整個 modal，所以不會卡、也不會跳回主畫面
 */
function wireModalEvents(k) {
  const body = $("#modalBody");

  // inputs
  body.querySelectorAll('input[data-field]').forEach((inp) => {
    inp.addEventListener("input", (e) => {
      const field = e.target.dataset.field;
      const idx = Number(e.target.dataset.idx);
      ensureTwoSlots(k);
      allRecords[k][idx] = { ...(allRecords[k][idx] || {}), [field]: e.target.value };
      scheduleSave();
    });
  });

  // option buttons (ice/sugar)
  body.querySelectorAll('button[data-role="optBtn"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const field = btn.dataset.field; // ice/sugar
      const idx = Number(btn.dataset.idx);
      const opt = btn.dataset.opt;

      ensureTwoSlots(k);
      allRecords[k][idx] = { ...(allRecords[k][idx] || {}), [field]: opt };

      // update UI in-place: 同一個 grid 內重新上色
      const grid = btn.closest('[data-role="optGrid"]');
      if (grid) {
        grid.querySelectorAll('button[data-role="optBtn"]').forEach((b) => {
          const isOn = b.dataset.opt === opt;
          b.classList.toggle("bg-sky-500", isOn);
          b.classList.toggle("text-white", isOn);
          b.classList.toggle("shadow-lg", isOn);
          b.classList.toggle("border-sky-500", isOn);

          b.classList.toggle("bg-white", !isOn);
          b.classList.toggle("text-slate-400", !isOn);
          b.classList.toggle("border-transparent", !isOn);
        });
      }

      scheduleSave();
      // 不重畫 modal → 不會卡
    });
  });

  // toppings
  body.querySelectorAll('button[data-role="toppingBtn"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.idx);
      const t = btn.dataset.topping;

      ensureTwoSlots(k);
      const cur = allRecords[k][idx] || {};
      const list = Array.isArray(cur.toppings) ? cur.toppings : [];
      const next = list.includes(t) ? list.filter((x) => x !== t) : [...list, t];
      allRecords[k][idx] = { ...cur, toppings: next };

      // update UI in-place
      const isOn = next.includes(t);
      btn.classList.toggle("bg-sky-500", isOn);
      btn.classList.toggle("text-white", isOn);
      btn.classList.toggle("bg-white", !isOn);
      btn.classList.toggle("text-slate-400", !isOn);

      scheduleSave();
    });
  });

  // clear
  body.querySelectorAll(".btnClear").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.idx);
      ensureTwoSlots(k);
      allRecords[k][idx] = {};
      renderModalBody(k);
      lucide.createIcons();
      wireModalEvents(k);
      scheduleSave(200);
      renderCalendar();
    });
  });
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/** ---------------- Start ---------------- */
function showLoading() {
  const root = $("#app");
  root.innerHTML = `
    <div class="flex h-screen items-center justify-center bg-sky-50">
      <div class="text-sky-500 animate-bounce flex flex-col items-center">
        <i data-lucide="cup-soda" class="w-12 h-12"></i>
        <span class="mt-4 font-bold">開啟手搖日誌中...</span>
      </div>
    </div>
  `;
  lucide.createIcons();
}

async function start() {
  showLoading();
  mountShell(); // 先掛好 DOM，避免你之前那種 null addEventListener

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
        setStatus("");
      },
      (err) => {
        console.error("onSnapshot error:", err);
        renderCalendar();
      }
    );
  });
}

start();
