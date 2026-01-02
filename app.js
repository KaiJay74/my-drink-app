import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ✅ 已整合你的 Firebase 設定
const firebaseConfig = {
  apiKey: "AIzaSyDMO5K4TXeUu89rSIA6yDo6LfvUcn_4O5s",
  authDomain: "my-drink-app-aef39.firebaseapp.com",
  projectId: "my-drink-app-aef39",
  storageBucket: "my-drink-app-aef39.firebasestorage.app",
  messagingSenderId: "871859123960",
  appId: "1:871859123960:web:21cb457ac63ae82fe9ad0d",
  measurementId: "G-6FH8VQWX8V"
};

// App 路徑用（可改名，不影響 Firebase 專案）
const APP_ID = "drink-tracker-2026";

const ICE_LEVELS = ["正常","少冰","微冰","去冰","常溫","溫"];
const SUGAR_LEVELS = ["全糖","少糖","半糖","微糖","一分糖","無糖"];
const TOPPINGS = ["珍珠","燕麥","粉粿","粉角","粉圓","雙Q","仙草","芋圓"];
const MONTHS = ["一月","二月","三月","四月","五月","六月","七月","八月","九月","十月","十一月","十二月"];

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let user = null;
let allRecords = {};
let current = new Date(2026, 0, 1);
let selectedDay = null;

const $ = (id) => document.getElementById(id);
const saveStatusEl = $("saveStatus");

function dateKey(year, monthIdx, day) {
  return `${year}-${monthIdx + 1}-${day}`;
}

function setStatus(text) {
  saveStatusEl.textContent = text || "";
}

function ensureTwoSlots(key) {
  if (!allRecords[key]) allRecords[key] = [{}, {}];
  if (!Array.isArray(allRecords[key])) allRecords[key] = [{}, {}];
  if (allRecords[key].length < 2) allRecords[key] = [allRecords[key][0] || {}, allRecords[key][1] || {}];
}

function flattenHistory() {
  return Object.values(allRecords).flat().filter(r => r && r.name);
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

  const favoriteStore = Object.entries(storeCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || "無";
  const favoriteItem = Object.entries(itemCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || "無";

  $("statCups").textContent = totalCups;
  $("statCost").textContent = totalCost;
  $("statAvg").textContent = avgPrice;
  $("statFavStore").textContent = favoriteStore;
  $("statFavItem").textContent = favoriteItem;
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
    setStatus("儲存失敗");
    console.error(e);
  }
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
    const div = document.createElement("div");
    div.className = "aspect-square";
    grid.appendChild(div);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const key = dateKey(y, m, d);
    const hasData = (allRecords[key] || []).some(r => r && r.name);

    const btn = document.createElement("button");
    btn.className =
      `aspect-square rounded-3xl border-2 flex flex-col items-center justify-center transition-all relative group
      ${hasData
        ? "bg-sky-100 border-sky-400 shadow-inner"
        : "bg-white border-sky-50 hover:border-sky-300 hover:scale-105 shadow-sm"
      }`;

    const num = document.createElement("span");
    num.className = `text-xl font-black ${hasData ? "text-sky-600" : "text-slate-300 group-hover:text-sky-400"}`;
    num.textContent = d;

    btn.appendChild(num);

    if (hasData) {
      const dots = document.createElement("div");
      dots.className = "mt-1 flex gap-1";
      const count = allRecords[key].filter(r => r && r.name).length;
      for (let i = 0; i < count; i++) {
        const dot = document.createElement("div");
        dot.className = "w-2 h-2 rounded-full bg-sky-500 animate-pulse";
        dots.appendChild(dot);
      }
      btn.appendChild(dots);
    }

    btn.addEventListener("click", () => openModal(d));
    grid.appendChild(btn);
  }

  computeStats();
}

function openModal(day) {
  selectedDay = day;
  const y = current.getFullYear();
  const m = current.getMonth();
  const key = dateKey(y, m, day);

  ensureTwoSlots(key);

  $("modalTitle").innerHTML = `
    <i data-lucide="calendar" class="w-7 h-7"></i>
    ${y} / ${m + 1} / ${day}
  `;

  const body = $("modalBody");
  body.innerHTML = "";

  for (let idx = 0; idx < 2; idx++) {
    const data = allRecords[key][idx] || {};
    const card = document.createElement("div");
    card.className = "bg-sky-50/50 rounded-[2.5rem] p-8 border border-sky-100 relative";

    card.innerHTML = `
      <div class="flex justify-between items-center mb-6">
        <span class="bg-white text-sky-600 px-6 py-2 rounded-full text-sm font-black shadow-sm">DRINK NO. ${idx + 1}</span>
        <button class="btnClear text-slate-300 hover:text-red-500 transition-colors" data-idx="${idx}">
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
            ${TOPPINGS.map(t => toppingBtn(t, idx, data.toppings || [])).join("")}
          </div>
        </div>
      </div>
    `;

    body.appendChild(card);
  }

  $("modal").classList.remove("hidden");
  $("modal").classList.add("flex");
  lucide.createIcons();
  wireModalEvents(key);
}

function closeModal() {
  $("modal").classList.add("hidden");
  $("modal").classList.remove("flex");
  selectedDay = null;
}

function inputGroup(label, field, idx, value, placeholder, type="text") {
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
    <div>
      <label class="block text-xs font-black text-sky-400 mb-3 uppercase tracking-widest">${label}</label>
      <div class="grid grid-cols-3 gap-2">
        ${options.map(opt => `
          <button type="button"
            data-field="${field}" data-idx="${idx}" data-opt="${opt}"
            class="py-2 rounded-xl text-xs font-bold transition-all ${selected===opt ? "bg-sky-500 text-white shadow-lg" : "bg-white text-slate-400 hover:border-sky-200 border-2 border-transparent"}">
            ${opt}
          </button>
        `).join("")}
      </div>
    </div>
  `;
}

function toppingBtn(name, idx, selectedList) {
  const on = selectedList.includes(name);
  return `
    <button type="button" data-topping="${name}" data-idx="${idx}"
      class="px-4 py-2 rounded-2xl text-sm font-bold transition-all ${on ? "bg-sky-500 text-white" : "bg-white text-slate-400 hover:bg-sky-100"}">
      ${name}
    </button>
  `;
}

function wireModalEvents(key) {
  document.querySelectorAll("#modalBody input[data-field]").forEach(inp => {
    inp.addEventListener("input", (e) => {
      const field = e.target.dataset.field;
      const idx = Number(e.target.dataset.idx);
      ensureTwoSlots(key);
      allRecords[key][idx] = { ...(allRecords[key][idx] || {}), [field]: e.target.value };
    });
  });

  document.querySelectorAll('#modalBody button[data-opt]').forEach(btn => {
    btn.addEventListener("click", () => {
      const field = btn.dataset.field;
      const idx = Number(btn.dataset.idx);
      const opt = btn.dataset.opt;
      ensureTwoSlots(key);
      allRecords[key][idx] = { ...(allRecords[key][idx] || {}), [field]: opt };
      openModal(selectedDay);
    });
  });

  document.querySelectorAll('#modalBody button[data-topping]').forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.idx);
      const t = btn.dataset.topping;
      ensureTwoSlots(key);
      const cur = allRecords[key][idx] || {};
      const list = Array.isArray(cur.toppings) ? cur.toppings : [];
      const next = list.includes(t) ? list.filter(x => x !== t) : [...list, t];
      allRecords[key][idx] = { ...cur, toppings: next };
      openModal(selectedDay);
    });
  });

  document.querySelectorAll("#modalBody .btnClear").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.idx);
      ensureTwoSlots(key);
      allRecords[key][idx] = {};
      openModal(selectedDay);
      saveToCloud();
      renderCalendar();
    });
  });
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

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
  openModal(today.getDate());
  renderCalendar();
});

// Firebase：匿名登入 + 監聽雲端資料
async function start() {
  await signInAnonymously(auth);

  onAuthStateChanged(auth, (u) => {
    user = u;
    if (!user) return;

    const ref = doc(db, "artifacts", APP_ID, "users", user.uid, "records", "yearly2026");
    onSnapshot(ref, (snap) => {
      if (snap.exists()) allRecords = snap.data().data || {};
      renderCalendar();
      setStatus("");
    }, (err) => {
      console.error("onSnapshot error:", err);
      renderCalendar();
    });
  });
}

start();
