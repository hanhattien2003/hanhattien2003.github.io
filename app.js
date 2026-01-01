// ========== Helpers ==========
const $ = (id) => document.getElementById(id);

const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  },
  set(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
};

function pad2(n){ return String(n).padStart(2,'0'); }

function fmtMMSS(sec){
  sec = Math.max(0, sec|0);
  const m = Math.floor(sec/60), s = sec%60;
  return `${pad2(m)}:${pad2(s)}`;
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

function todayStr(){
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}

function parseYMD(ymd){
  // ymd: "YYYY-MM-DD"
  const [y,m,d] = ymd.split("-").map(Number);
  return new Date(y, (m||1)-1, d||1);
}

function diffDays(aYmd, bYmd){
  // b - a (số ngày)
  const a = parseYMD(aYmd);
  const b = parseYMD(bYmd);
  const ms = 24*60*60*1000;
  return Math.floor((b - a)/ms);
}

// Simple beep (WebAudio)
let audioCtx;
function beep(){
  try{
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.06;
    o.connect(g); g.connect(audioCtx.destination);
    o.start();
    setTimeout(()=>{ o.stop(); }, 180);
  }catch(e){}
}

// ========== Notifications ==========
function requestNotifyPermission(){
  if(!("Notification" in window)) return;
  if(Notification.permission === "default"){
    Notification.requestPermission().catch(()=>{});
  }
}

function showNotify(title, body){
  if(!("Notification" in window)) return;
  if(Notification.permission !== "granted") return;
  try{
    new Notification(title, { body });
  }catch(e){}
}

// ========== Tabs ==========
const tabTimer = $("tabTimer");
const tabSupp  = $("tabSupp");
const screenTimer = $("screenTimer");
const screenSupp  = $("screenSupp");

tabTimer.onclick = () => {
  tabTimer.classList.add("active"); tabSupp.classList.remove("active");
  screenTimer.style.display = ""; screenSupp.style.display = "none";
};

tabSupp.onclick = () => {
  tabSupp.classList.add("active"); tabTimer.classList.remove("active");
  screenSupp.style.display = ""; screenTimer.style.display = "none";
  requestNotifyPermission();
};

// ========== TIMER ==========
const presets = [30,45,60,90,120,180];

let selected = store.get("rest_sec", 90);
let totalSets = store.get("total_sets", 4);
let currentSet = store.get("current_set", 1);

let remaining = selected;
let running = false;
let tmr = null;

const chips = $("chips");

function renderChips(){
  chips.innerHTML = "";
  presets.forEach(sec=>{
    const c = document.createElement("div");
    c.className = "chip" + (sec===selected ? " active":"");
    c.textContent = sec >= 60 ? `${sec/60}p` : `${sec}s`;
    c.onclick = ()=>{
      selected = sec;
      store.set("rest_sec", selected);
      remaining = selected;
      updateTime();
      renderChips();
    };
    chips.appendChild(c);
  });
}

function updateTime(){ $("timeText").textContent = fmtMMSS(remaining); }
function updateSet(){ $("setText").textContent = `${currentSet} / ${totalSets}`; }

function stopInterval(){
  running = false;
  $("btnStart").disabled = false;
  $("btnPause").disabled = true;
  if(tmr) clearInterval(tmr);
  tmr = null;
}

function start(){
  if(running) return;
  running = true;
  $("btnStart").disabled = true;
  $("btnPause").disabled = false;

  tmr = setInterval(()=>{
    remaining -= 1;
    updateTime();
    if(remaining <= 0){
      stopInterval();
      remaining = 0;
      updateTime();
      beep();
      showNotify("Hết giờ nghỉ!", "Tới set tiếp theo!");
    }
  }, 1000);
}

function reset(){
  stopInterval();
  remaining = selected;
  updateTime();
}

$("btnStart").onclick = () => start();
$("btnPause").onclick = () => stopInterval();
$("btnReset").onclick = () => reset();

$("btnMinus").onclick = () => {
  totalSets = Math.max(1, totalSets-1);
  currentSet = Math.min(currentSet, totalSets);
  store.set("total_sets", totalSets);
  store.set("current_set", currentSet);
  updateSet();
};

$("btnPlus").onclick = () => {
  totalSets += 1;
  store.set("total_sets", totalSets);
  updateSet();
};

$("btnDone").onclick = () => {
  if(currentSet < totalSets) currentSet += 1;
  store.set("current_set", currentSet);
  updateSet();
  remaining = selected;
  updateTime();
  start();
};

// init timer UI
renderChips();
remaining = selected;
updateTime();
updateSet();

// ========== SUPPLEMENTS ==========
/**
 * item: {
 *   id: string,
 *   name: string,
 *   timeHHMM: string,
 *   intervalDays: number, // 1 = mỗi ngày, 2 = cách 1 ngày
 *   lastFiredDate: string // "YYYY-MM-DD" lần gần nhất đã nhắc
 * }
 */
let supps = store.get("supps", []);

function normalizeSupps(){
  // đảm bảo dữ liệu cũ vẫn chạy
  supps = (supps || []).map(s => ({
    id: s.id ?? (crypto?.randomUUID?.() ?? String(Date.now())),
    name: s.name ?? "TPBS",
    timeHHMM: s.timeHHMM ?? "08:00",
    intervalDays: (s.intervalDays === 2 ? 2 : 1),
    lastFiredDate: s.lastFiredDate ?? ""
  }));
  store.set("supps", supps);
}

normalizeSupps();

function renderSupps(){
  const tb = $("suppTable");
  tb.innerHTML = "";

  if(!supps.length){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="4" class="muted">Chưa có nhắc nào. Thêm ở phía trên.</td>`;
    tb.appendChild(tr);
    return;
  }

  const today = todayStr();

  supps
    .slice()
    .sort((a,b)=>a.timeHHMM.localeCompare(b.timeHHMM))
    .forEach(item=>{
      const firedToday = item.lastFiredDate === today;
      const freqText = (item.intervalDays === 2) ? "Cách 1 ngày" : "Mỗi ngày";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(item.name)}</td>
        <td>
          <div>${item.timeHHMM}</div>
          <div class="muted">${freqText}</div>
        </td>
        <td>${firedToday ? "✅ Đã nhắc hôm nay" : "⏳ Chưa nhắc"}</td>
        <td><button class="btn" data-del="${item.id}">Xóa</button></td>
      `;
      tb.appendChild(tr);
    });

  tb.querySelectorAll("button[data-del]").forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.getAttribute("data-del");
      supps = supps.filter(s=>s.id !== id);
      store.set("supps", supps);
      renderSupps();
    };
  });
}

$("btnAddSupp").onclick = ()=>{
  const name = $("suppName").value.trim();
  const time = $("suppTime").value || "08:00";
  const freq = parseInt($("suppFreq").value || "1", 10); // 1 hoặc 2
  if(!name) return;

  supps.push({
    id: crypto?.randomUUID?.() ?? String(Date.now()),
    name,
    timeHHMM: time,
    intervalDays: (freq === 2 ? 2 : 1),
    lastFiredDate: "" // chưa nhắc lần nào
  });

  store.set("supps", supps);
  $("suppName").value = "";
  renderSupps();
  requestNotifyPermission();
};

$("btnTestNotify").onclick = ()=>{
  requestNotifyPermission();
  showNotify("Test nhắc TPBS", "Nếu bạn thấy thông báo, quyền đã OK.");
  beep();
};

$("btnClearAll").onclick = ()=>{
  if(!confirm("Xóa toàn bộ nhắc TPBS?")) return;
  supps = [];
  store.set("supps", supps);
  renderSupps();
};

// Logic check nhắc mỗi 30 giây (khi app đang mở)
setInterval(()=>{
  if(!supps.length) return;

  const now = new Date();
  const hhmm = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  const today = todayStr();

  let changed = false;

  for(const item of supps){
    if(item.timeHHMM !== hhmm) continue;

    // Không nhắc lại 2 lần trong cùng 1 ngày
    if(item.lastFiredDate === today) continue;

    const interval = item.intervalDays ?? 1; // 1=mỗi ngày, 2=cách 1 ngày
    const last = item.lastFiredDate;

    // "Cách 1 ngày": nếu lần gần nhất đã nhắc cách hôm nay >= 2 ngày
    const dueByInterval =
      (interval === 1) ||
      (!last) ||
      (diffDays(last, today) >= interval);

    if(!dueByInterval) continue;

    item.lastFiredDate = today;
    changed = true;

    beep();
    showNotify("Đến giờ uống TPBS", `${item.name} (${item.timeHHMM})`);
  }

  if(changed){
    store.set("supps", supps);
    renderSupps();
  }
}, 30000);

// init supp UI
renderSupps();

// Service worker (tuỳ chọn): nếu bạn không dùng thì bỏ qua (vẫn chạy bình thường)
if ("serviceWorker" in navigator) {
  // bạn có thể tự thêm sw.js sau, không bắt buộc
}
