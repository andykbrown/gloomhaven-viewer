/* Gloomhaven Scenario Viewer — web edition
   Data extracted from the Unity scenes of the Gloomhaven Scenario Viewer app. */

const HEX_D = 1.28;                    // hex centre-to-centre, world units
const HEX_R = HEX_D / Math.sqrt(3);    // circumradius (pointy-top)
const CONDS = ["Stun","Immobilize","Disarm","Wound","Poison","Muddle","Strengthen","Invisible"];

const $ = s => document.querySelector(s);
const canvas = $("#map"), ctx = canvas.getContext("2d");

let index = [], filtered = [], current = null, scenario = null;
let mode = "view", groups = new Set(), query = "";
let cam = {x:0, y:0, scale:40}, drag = null;
let hiddenTiles = new Set(), tracked = [], hoverNode = null, revealed = new Set();
const imgCache = new Map();

/* ---------- persistence (best effort) ---------- */
const store = {
  get(k, d){ try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

/* ---------- boot ---------- */
init();
async function init(){
  index = await (await fetch("data/index.json")).json();
  buildGroupChips();
  applyFilter();
  const last = store.get("gh:last", null);
  const start = index.find(e => e.level === last) || filtered[0];
  if (start) select(start.level);
  wire();
  resize();
}

/* ---------- scenario list ---------- */
function label(e){
  if (e.title) return e.title;
  if (e.alts && e.alts.length) return e.alts.join(" / ");
  return e.group + (e.num ? " " + e.num : "");
}
function buildGroupChips(){
  const all = [...new Set(index.map(e => e.group))];
  groups = new Set(all);
  $("#groups").innerHTML = all.map(g =>
    `<button class="gchip on" data-g="${g}">${g}</button>`).join("");
  $("#groups").onclick = ev => {
    const b = ev.target.closest(".gchip"); if (!b) return;
    const g = b.dataset.g;
    groups.has(g) ? groups.delete(g) : groups.add(g);
    b.classList.toggle("on");
    applyFilter();
  };
}
function applyFilter(){
  const q = query.trim().toLowerCase();
  filtered = index.filter(e => {
    if (!groups.has(e.group)) return false;
    if (!q) return true;
    const hay = [label(e), e.group, "#" + e.num, ...(e.monsters||[])].join(" ").toLowerCase();
    return hay.includes(q);
  });
  renderList();
}
function renderList(){
  $("#list").innerHTML = filtered.map(e => `
    <li data-l="${e.level}" class="${current === e.level ? "sel" : ""}">
      <span class="num">${e.num ? "#" + e.num : "—"}</span><span class="tt">${label(e)}</span>
      <span class="meta">${e.group} · ${e.starts} starts · ${(e.monsters||[]).slice(0,3).join(", ") || "no monsters"}${(e.monsters||[]).length>3 ? "…" : ""}</span>
    </li>`).join("");
  $("#count").textContent = `${filtered.length} of ${index.length} scenarios`;
}

/* ---------- load + render a scenario ---------- */
async function select(level){
  current = level;
  store.set("gh:last", level);
  renderList();
  const e = index.find(x => x.level === level);
  $("#title").textContent = label(e);
  $("#subtitle").textContent = `${e.group}${e.num ? " #" + e.num : ""} · ${e.objects} objects`;
  scenario = await (await fetch(`data/scenarios/level${level}.json`)).json();
  scenario.nodes.sort((a,b) => (a.o - b.o) || ((b.w*b.h) - (a.w*a.h)));
  scenario.grid = fitGrid(scenario.nodes);
  hiddenTiles = new Set();
  revealed = new Set(store.get("gh:revealed:" + level, []));
  tracked = store.get("gh:tracked:" + level, []);
  renderTracked(); renderTiles();
  await preload(scenario.nodes);
  fit();
}
function preload(nodes){
  const files = [...new Set(nodes.map(n => n.f))];
  return Promise.all(files.map(f => new Promise(res => {
    if (imgCache.has(f)) return res();
    const img = new Image();
    img.onload = img.onerror = () => { imgCache.set(f, img); res(); };
    img.src = "assets/sprites/" + encodeURIComponent(f);
  })));
}
function isMonster(n){ return n.k === "monster"; }
function isTile(n){ return n.k === "tile"; }
const MAP_KINDS = new Set(["tile","door","overlay","token","start"]);
function visible(n){
  if (hiddenTiles.has(n.root)) return false;
  if (n.k === "page")    return $("#showpage").checked;
  if (n.k === "cover")   return $("#showpage").checked && $("#showcovers").checked && !revealed.has(nodeId(n));
  if (n.k === "monster") return $("#showmap").checked && $("#showmon").checked;
  if (MAP_KINDS.has(n.k))return $("#showmap").checked;
  return true;
}

function draw(){
  const W = canvas.width, H = canvas.height, dpr = window.devicePixelRatio || 1;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.fillStyle = "#0e0c0a"; ctx.fillRect(0,0,W,H);
  if (!scenario) return;
  const s = cam.scale * dpr, cx = W/2, cy = H/2;
  const toScreen = (x,y) => [cx + (x - cam.x)*s, cy - (y - cam.y)*s];

  if ($("#showgrid").checked) drawGrid(toScreen, s);
  const marks = [];

  for (const n of scenario.nodes){
    if (!visible(n)) continue;
    const img = imgCache.get(n.f);
    if (!img || !img.width) continue;
    const [sx, sy] = toScreen(n.x, n.y);
    const w = n.w * s, h = n.h * s;
    if (sx + w < -50 || sx - w > W + 50 || sy + h < -50 || sy - h > H + 50) continue;
    ctx.save();
    ctx.translate(sx, sy);
    if (n.rot) ctx.rotate(-n.rot * Math.PI / 180);
    ctx.drawImage(img, -w/2, -h/2, w, h);
    ctx.restore();
    const t = tracked.find(t => t.id === nodeId(n));
    if (t) marks.push([sx, sy, Math.max(w,h)/2*0.6, t.elite ? "#c8a24a" : "#b4472e", 3*dpr]);
    else if (hoverNode === n && mode === "play")
      marks.push([sx, sy, Math.max(w,h)/2*0.6, "#e8e0d0", 2*dpr]);
  }
  for (const m of marks) ring(...m);
}
function ring(x,y,r,color,lw){
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.stroke(); ctx.restore();
}
function drawGrid(toScreen, s){
  const b = scenario.mapBounds || scenario.bounds, g = scenario.grid;
  ctx.save();
  ctx.strokeStyle = "rgba(200,162,74,.20)"; ctx.lineWidth = 1;
  for (let r = -60; r <= 60; r++){
    for (let q = -60; q <= 60; q++){
      const x = g.dx + HEX_R * (Math.sqrt(3)*q + Math.sqrt(3)/2*r);
      const y = g.dy + HEX_R * (1.5*r);
      if (x < b[0]-1 || x > b[2]+1 || y < b[1]-1 || y > b[3]+1) continue;
      const [sx, sy] = toScreen(x, y);
      ctx.beginPath();
      for (let i = 0; i < 6; i++){
        const a = Math.PI/180 * (60*i - 90);
        const px = sx + HEX_R*s*Math.cos(a), py = sy + HEX_R*s*Math.sin(a);
        i ? ctx.lineTo(px,py) : ctx.moveTo(px,py);
      }
      ctx.closePath(); ctx.stroke();
    }
  }
  ctx.restore();
}
/* fit the hex lattice using StartPosition markers, which sit exactly on hex centres */
function fitGrid(nodes){
  const pts = nodes.filter(n => /StartPosition/.test(n.n)).map(n => [n.x, n.y]);
  if (pts.length < 2) return {dx:0, dy:0};
  const ax = (x,y) => [(Math.sqrt(3)/3*x - y/3)/HEX_R, (2/3*y)/HEX_R];
  const round = (q,r) => {
    let s = -q-r, rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
    const dq = Math.abs(rq-q), dr = Math.abs(rr-r), ds = Math.abs(rs-s);
    if (dq > dr && dq > ds) rq = -rr-rs; else if (dr > ds) rr = -rq-rs;
    return [rq, rr];
  };
  let best = {e:Infinity, dx:0, dy:0};
  const N = 30;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++){
    const dx = HEX_D*i/N, dy = HEX_D*Math.sqrt(3)/2*j/N;
    let e = 0;
    for (const [x,y] of pts){
      const [q,r] = ax(x-dx, y-dy); const [rq,rr] = round(q,r);
      e += (q-rq)**2 + (r-rr)**2;
    }
    if (e < best.e) best = {e, dx, dy};
  }
  return best;
}

/* ---------- camera ---------- */
function fit(){
  if (!scenario) return;
  const b = ($("#showpage").checked && scenario.pageBounds) ? scenario.bounds
          : (scenario.mapBounds || scenario.bounds);
  const dpr = window.devicePixelRatio || 1;
  const w = b[2]-b[0], h = b[3]-b[1];
  cam.x = (b[0]+b[2])/2; cam.y = (b[1]+b[3])/2;
  cam.scale = Math.min(canvas.width/dpr/(w*1.06), canvas.height/dpr/(h*1.06));
  draw();
}
function zoom(f, ax, ay){
  const dpr = window.devicePixelRatio || 1;
  const before = screenToWorld(ax, ay);
  cam.scale = Math.max(4, Math.min(400, cam.scale * f));
  const after = screenToWorld(ax, ay);
  cam.x += before[0]-after[0]; cam.y += before[1]-after[1];
  draw();
}
function screenToWorld(px, py){
  const r = canvas.getBoundingClientRect();
  const x = cam.x + (px - r.left - r.width/2) / cam.scale;
  const y = cam.y - (py - r.top - r.height/2) / cam.scale;
  return [x, y];
}
function resize(){
  const dpr = window.devicePixelRatio || 1;
  const r = canvas.getBoundingClientRect();
  canvas.width = r.width*dpr; canvas.height = r.height*dpr;
  draw();
}

/* ---------- hit testing ---------- */
function nodeId(n){ return `${n.n}@${n.x},${n.y}`; }
function hitTest(px, py, pred){
  if (!scenario) return null;
  const [wx, wy] = screenToWorld(px, py);
  for (let i = scenario.nodes.length - 1; i >= 0; i--){
    const n = scenario.nodes[i];
    if (!visible(n) || !pred(n)) continue;
    const a = (n.rot||0) * Math.PI/180;
    const dx = wx - n.x, dy = wy - n.y;
    const lx =  dx*Math.cos(a) + dy*Math.sin(a);
    const ly = -dx*Math.sin(a) + dy*Math.cos(a);
    if (Math.abs(lx) <= n.w/2 && Math.abs(ly) <= n.h/2) return n;
  }
  return null;
}
function pickCover(px,py){ return hitTest(px,py, n => n.k === "cover"); }
function pick(px, py){
  if (!scenario) return null;
  const [wx, wy] = screenToWorld(px, py);
  for (let i = scenario.nodes.length - 1; i >= 0; i--){
    const n = scenario.nodes[i];
    if (!visible(n) || !isMonster(n)) continue;
    const a = (n.rot||0) * Math.PI/180;
    const dx = wx - n.x, dy = wy - n.y;
    const lx =  dx*Math.cos(a) + dy*Math.sin(a);
    const ly = -dx*Math.sin(a) + dy*Math.cos(a);
    if (Math.abs(lx) <= n.w/2 && Math.abs(ly) <= n.h/2) return n;
  }
  return null;
}

/* ---------- play aid ---------- */
function track(n){
  const id = nodeId(n);
  if (tracked.find(t => t.id === id)) return;
  tracked.push({ id, name: n.n.replace(/^(Horz|Vert)-/,"").replace(/\s*\(\d+\)$/,""),
                 hp: "", elite: false, conds: [] });
  saveTracked(); renderTracked(); draw();
}
function saveTracked(){ if (current) store.set("gh:tracked:" + current, tracked); }
function renderTracked(){
  const el = $("#tracked");
  if (!tracked.length){
    el.innerHTML = `<div class="empty">Switch to <strong>Play</strong> and click a monster on the map to start tracking its health and conditions.</div>`;
    return;
  }
  el.innerHTML = tracked.map((t,i) => `
    <div class="card" data-i="${i}">
      <div class="nm"><span>${t.name}</span><button data-act="del" title="Remove">×</button></div>
      <div class="hp">
        <button data-act="dec">−</button>
        <input data-act="hp" value="${t.hp}" placeholder="hp" inputmode="numeric">
        <button data-act="inc">+</button>
        <button class="elite ${t.elite ? "on" : ""}" data-act="elite">elite</button>
      </div>
      <div class="conds">${CONDS.map(c =>
        `<button class="cond ${t.conds.includes(c) ? "on" : ""}" data-act="cond" data-c="${c}">${c}</button>`).join("")}</div>
    </div>`).join("");
}
function renderTiles(){
  const roots = [...new Set(scenario.nodes.filter(n => n.k === "tile" || n.k === "door").map(n => n.root || n.n))].sort();
  $("#tiles").innerHTML = roots.length
    ? roots.map(r => `<label class="tilerow"><input type="checkbox" checked data-t="${r}"><span>${r}</span></label>`).join("")
    : `<div class="empty">No separable tiles in this scene.</div>`;
}

/* ---------- events ---------- */
function wire(){
  $("#search").oninput = e => { query = e.target.value; applyFilter(); };
  $("#list").onclick = e => { const li = e.target.closest("li"); if (li) select(+li.dataset.l); };
  $("#fit").onclick = fit;
  $("#zin").onclick = () => zoom(1.25, innerWidth/2, innerHeight/2);
  $("#zout").onclick = () => zoom(0.8, innerWidth/2, innerHeight/2);
  for (const id of ["#showgrid","#showmon","#showpage","#showmap","#showcovers"])
    $(id).onchange = () => { if (id === "#showpage") fit(); else draw(); };
  for (const b of document.querySelectorAll(".seg")) b.onclick = () => {
    mode = b.dataset.mode;
    document.querySelectorAll(".seg").forEach(x => x.classList.toggle("active", x === b));
    canvas.classList.toggle("play", mode === "play");
    draw();
  };
  $("#clear-tracked").onclick = () => { tracked = []; saveTracked(); renderTracked(); draw(); };

  $("#tracked").onclick = e => {
    const btn = e.target.closest("[data-act]"); if (!btn) return;
    const i = +btn.closest(".card").dataset.i, t = tracked[i];
    const act = btn.dataset.act;
    if (act === "del") tracked.splice(i,1);
    else if (act === "inc") t.hp = (+t.hp || 0) + 1;
    else if (act === "dec") t.hp = (+t.hp || 0) - 1;
    else if (act === "elite") t.elite = !t.elite;
    else if (act === "cond"){
      const c = btn.dataset.c;
      t.conds.includes(c) ? t.conds.splice(t.conds.indexOf(c),1) : t.conds.push(c);
    }
    saveTracked(); renderTracked(); draw();
  };
  $("#tracked").onchange = e => {
    if (e.target.dataset.act !== "hp") return;
    tracked[+e.target.closest(".card").dataset.i].hp = e.target.value;
    saveTracked();
  };
  $("#tiles").onchange = e => {
    const t = e.target.dataset.t; if (!t) return;
    e.target.checked ? hiddenTiles.delete(t) : hiddenTiles.add(t);
    draw();
  };

  canvas.addEventListener("pointerdown", e => {
    const cov = pickCover(e.clientX, e.clientY);
    if (cov){
      revealed.add(nodeId(cov));
      store.set("gh:revealed:" + current, [...revealed]);
      draw(); return;
    }
    if (mode === "play"){
      const n = pick(e.clientX, e.clientY);
      if (n){ track(n); return; }
    }
    drag = {x:e.clientX, y:e.clientY, cx:cam.x, cy:cam.y};
    canvas.classList.add("drag"); canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", e => {
    if (drag){
      cam.x = drag.cx - (e.clientX - drag.x)/cam.scale;
      cam.y = drag.cy + (e.clientY - drag.y)/cam.scale;
      draw(); return;
    }
    if (mode === "play"){
      const n = pick(e.clientX, e.clientY);
      if (n !== hoverNode){ hoverNode = n; draw(); }
    }
  });
  canvas.addEventListener("pointerup", e => {
    drag = null; canvas.classList.remove("drag");
    try { canvas.releasePointerCapture(e.pointerId); } catch {}
  });
  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    zoom(e.deltaY < 0 ? 1.12 : 0.89, e.clientX, e.clientY);
  }, {passive:false});
  addEventListener("resize", resize);
  addEventListener("keydown", e => {
    if (e.target.tagName === "INPUT") return;
    if (e.key === "f") fit();
    if (e.key === "g") { $("#showgrid").checked = !$("#showgrid").checked; draw(); }
    const i = filtered.findIndex(x => x.level === current);
    if (e.key === "ArrowDown" && i < filtered.length-1) select(filtered[i+1].level);
    if (e.key === "ArrowUp" && i > 0) select(filtered[i-1].level);
  });
}
