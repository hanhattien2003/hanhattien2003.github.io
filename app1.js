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
      selected = sec; store.set("rest_sec", selected);
      remaining = selected;
      updateTime();
      renderChips();
    };
    chips.appendChild(c);
  });
}
function updateTime(){ $("timeText").textContent = fmtMMSS(remaining); }
function updateSet(){ $("setText").textContent = `${currentSet} / ${totalSets}`; }

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
      showNotify("Hết giờ nghỉ!", `Bắt đầu set ${Math.min(currentSet+1,totalSets)} hoặc chỉnh set.`);
    }
  }, 1000);
}
function stopInterval(){
  running = false;
  $("btnStart").disabled = false;
  $("btnPause").disabled = true;
  if(tmr) clearInterval(tmr);
  tmr = null;
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
  // xong set -> tăng set nếu còn, rồi reset timer và start
  if(currentSet < totalSets) currentSet += 1;
  store.set("current_set", currentSet);
  updateSet();
  remaining = selected;
  updateTime();
  start();
};

// Init timer UI
renderChips();
remaining = selected;
updateTime();
updateSet();

// ========== NOTIFICATIONS (in-app) ==========
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

// ========== SUPPLEMENTS ==========
let supps = store.get("supps", []); 
// item: {id, name, timeHHMM, lastFiredDate:'YYYY-MM-DD'}

function todayStr(){
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}

function renderSupps(){
  const tb = $("suppTable");
  tb.innerHTML = "";
  if(supps.length === 0){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="4" class="muted">Chưa có nhắc nào. Thêm ở phía trên.</td>`;
    tb.appendChild(tr);
    return;
  }
  supps.sort((a,b)=>a.timeHHMM.localeCompare(b.timeHHMM)).forEach(item=>{
    const tr = document.createElement("tr");
    const firedToday = item.lastFiredDate === todayStr();
    tr.innerHTML = `
      <td>${escapeHtml(item.name)}</td>
      <td>${item.timeHHMM}</td>
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

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

$("btnAddSupp").onclick = ()=>{
  const name = $("suppName").value.trim();
  const time = $("suppTime").value || "08:00";
  if(!name) return;

  supps.push({
    id: crypto?.randomUUID?.() ?? String(Date.now()),
    name,
    timeHHMM: time,
    lastFiredDate: ""
  });
  store.set("supps", supps);
  $("suppName").value = "";
  renderSupps();
  requestNotifyPermission();
};

$("btnTestNotify").onclick = ()=>{
  requestNotifyPermission();
  showNotify("Test nhắc TPBS", "Nếu bạn thấy thông báo, quyền đã OK.");
};

// Check reminders every 30s while app is open
setInterval(()=>{
  const now = new Date();
  const hhmm = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  const today = todayStr();

  let changed = false;
  supps.forEach(item=>{
    if(item.timeHHMM === hhmm && item.lastFiredDate !== today){
      item.lastFiredDate = today;
      changed = true;
      beep();
      showNotify("Đến giờ uống TPBS", `${item.name} (${item.timeHHMM})`);
    }
  });

  if(changed){
    store.set("supps", supps);
    renderSupps();
  }
}, 30000);

// Init supp UI
renderSupps();
