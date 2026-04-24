'use strict';

// ═══════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════
const TILE   = 40;          // tile size in pixels
const MCOLS  = 60;          // map columns  (2400 px)
const MROWS  = 50;          // map rows     (2000 px)
const MW     = MCOLS * TILE;
const MH     = MROWS * TILE;

const TILE_FLOOR = 0;
const TILE_WALL  = 1;
const TILE_GOAL  = 2;

// Goal lives at the right border, vertically centred
const GOAL_ROW = 25;
const GOAL_COL = MCOLS - 1; // col 59

// Player
const P_RADIUS   = 17;
const P_SPEED    = 190;
const P_MAX_HP   = 10000;

// Monster
const M_RADIUS       = 20;
const M_SPEED        = 85;
const M_MAX_HP       = 5000;
const M_CONTACT_DMG  = 3000;
const M_CONTACT_CD   = 3000; // ms
const M_RANGE_DMG    = 500;
const M_RANGE_CD     = 3000; // ms
const M_RANGE_DIST   = 380;  // px
const MAX_MONSTERS   = 5;
const M_RESPAWN_MS   = 5000;

// Projectiles
const PROJ_SPEED  = 380; // player projectile px/s
const MPROJ_SPEED = 200; // monster projectile px/s

// Skills
const SK_RANGED_DMG  = 1000;
const SK_RANGED_CD   = 2000;
const SK_MELEE_DMG   = 2000;
const SK_MELEE_CD    = 2000;
const SK_MELEE_RANGE = 85;
const SK_SHIELD_DUR  = 3000; // ms active
const SK_SHIELD_CD   = 5000; // ms cooldown AFTER expiry

// ═══════════════════════════════════════════════════════════
//  AUDIO  (Web Audio API – no external files)
// ═══════════════════════════════════════════════════════════
let _ac = null;
function ac() {
  if (!_ac) _ac = new (window.AudioContext || window.webkitAudioContext)();
  return _ac;
}

function sndRanged() {
  const a = ac();
  const osc = a.createOscillator();
  const g   = a.createGain();
  osc.connect(g); g.connect(a.destination);
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(900, a.currentTime);
  osc.frequency.exponentialRampToValueAtTime(180, a.currentTime + 0.12);
  g.gain.setValueAtTime(0.28, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.14);
  osc.start(); osc.stop(a.currentTime + 0.14);
}

function sndMelee() {
  const a = ac();
  const len = Math.floor(a.sampleRate * 0.10);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d   = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random()*2-1) * Math.pow(1-i/len, 1.5);
  const src = a.createBufferSource();
  src.buffer = buf;
  const flt = a.createBiquadFilter();
  flt.type = 'lowpass'; flt.frequency.value = 900;
  const g = a.createGain(); g.gain.value = 0.55;
  src.connect(flt); flt.connect(g); g.connect(a.destination);
  src.start();
}

function sndHit() {
  const a = ac();
  const osc = a.createOscillator();
  const g   = a.createGain();
  osc.connect(g); g.connect(a.destination);
  osc.type = 'square';
  osc.frequency.setValueAtTime(140, a.currentTime);
  osc.frequency.exponentialRampToValueAtTime(45, a.currentTime + 0.09);
  g.gain.setValueAtTime(0.4, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.1);
  osc.start(); osc.stop(a.currentTime + 0.1);
}

function sndShield() {
  const a = ac();
  const osc = a.createOscillator();
  const g   = a.createGain();
  osc.connect(g); g.connect(a.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(380, a.currentTime);
  osc.frequency.linearRampToValueAtTime(640, a.currentTime + 0.18);
  g.gain.setValueAtTime(0.28, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.22);
  osc.start(); osc.stop(a.currentTime + 0.22);
}

// ═══════════════════════════════════════════════════════════
//  MAP
// ═══════════════════════════════════════════════════════════
let mapTiles = []; // [row][col]

function initMap() {
  // All floor
  for (let r = 0; r < MROWS; r++) {
    mapTiles[r] = new Int8Array(MCOLS); // 0 = FLOOR
  }

  // Border walls
  for (let c = 0; c < MCOLS; c++) {
    mapTiles[0][c]        = TILE_WALL;
    mapTiles[MROWS-1][c]  = TILE_WALL;
  }
  for (let r = 0; r < MROWS; r++) {
    mapTiles[r][0]        = TILE_WALL;
    mapTiles[r][MCOLS-1]  = TILE_WALL;
  }

  // ── Goal tile (replaces right-border wall at GOAL_ROW) ──
  mapTiles[GOAL_ROW][GOAL_COL] = TILE_GOAL;

  // ── Barrier wall in front of goal  (col 56, rows 22-28)
  //    Forces player to go around (above row 21 or below row 29)
  for (let r = 22; r <= 28; r++) mapTiles[r][56] = TILE_WALL;

  // ── Scattered obstacle blocks ──
  wallBlock(5,  5,  6, 4);   // upper-left cluster
  wallBlock(18, 4,  4, 5);   // upper-center-left
  wallBlock(36, 3,  5, 4);   // upper-right area
  wallBlock(48, 4,  4, 5);   // far upper-right
  wallBlock(5,  19, 5, 5);   // mid-left
  wallBlock(22, 21, 7, 4);   // center obstacle
  wallBlock(44, 16, 3, 8);   // right-center vertical
  wallBlock(10, 38, 5, 6);   // lower-left
  wallBlock(28, 39, 8, 4);   // lower-center
  wallBlock(44, 35, 5, 5);   // lower-right cluster
  wallBlock(7,  44, 6, 4);   // bottom-left
  wallBlock(35, 44, 7, 4);   // bottom-center
  wallBlock(18, 33, 4, 5);   // mid-lower-left
}

function wallBlock(col, row, w, h) {
  for (let r = row; r < row + h; r++) {
    for (let c = col; c < col + w; c++) {
      if (r > 0 && r < MROWS-1 && c > 0 && c < MCOLS-1) {
        // Never overwrite the goal tile
        if (!(r === GOAL_ROW && c === GOAL_COL)) {
          mapTiles[r][c] = TILE_WALL;
        }
      }
    }
  }
}

function getTile(c, r) {
  if (c < 0 || c >= MCOLS || r < 0 || r >= MROWS) return TILE_WALL;
  return mapTiles[r][c];
}
function tileIsWall(c, r) { return getTile(c, r) === TILE_WALL; }

// ═══════════════════════════════════════════════════════════
//  GAME STATE
// ═══════════════════════════════════════════════════════════
let screen = 'lobby'; // lobby | howtoplay | skillorder | playing | win | gameover

let orderedSkills = ['ranged', 'melee', 'shield']; // set by skill-order UI

// Player
const player = {
  x: 0, y: 0,
  radius: P_RADIUS,
  hp: P_MAX_HP, maxHp: P_MAX_HP,
  speed: P_SPEED,
  skills: [],          // ['ranged','melee','shield'] in ordered slots
  skillIdx: 0,         // current active slot
  cd: { ranged: 0, melee: 0, shield: 0 },  // remaining ms cooldowns
  shieldActive: false,
  shieldTimer:  0,     // ms remaining
  shieldCdActive: false, // waiting post-expiry cooldown
  hitFlash: 0,         // ms for red flash on hurt
};

// Monsters
let monsters    = [];  // alive monsters
let respawnQ    = [];  // { time, spawnIdx }

// Projectiles & effects
let projectiles = [];
let effects     = []; // temporary visual effects

// Camera
let camX = 0, camY = 0;

// Input
const keys = {};
let mwx = 0, mwy = 0; // mouse world coords
let lastTime = 0;

// ═══════════════════════════════════════════════════════════
//  ENTITIES
// ═══════════════════════════════════════════════════════════
const SPAWN_POINTS = [
  { x: 3*TILE+20,       y: 3*TILE+20 },
  { x: (MCOLS-4)*TILE,  y: 3*TILE+20 },
  { x: 3*TILE+20,       y: (MROWS-4)*TILE },
  { x: (MCOLS-4)*TILE,  y: (MROWS-4)*TILE },
  { x: (MCOLS/2)*TILE,  y: 3*TILE+20 },
];

function mkMonster(spawnIdx) {
  const sp = SPAWN_POINTS[spawnIdx % SPAWN_POINTS.length];
  // Nudge if inside a wall
  let x = sp.x, y = sp.y;
  if (tileIsWall(Math.floor(x/TILE), Math.floor(y/TILE))) {
    x = MW/2 + (Math.random()-0.5)*300;
    y = MH/2 + (Math.random()-0.5)*300;
  }
  return { x, y, radius: M_RADIUS, hp: M_MAX_HP, maxHp: M_MAX_HP,
           contactCd: 0, rangedCd: (spawnIdx * 600) % M_RANGE_CD,
           spawnIdx };
}

function initMonsters() {
  monsters  = [];
  respawnQ  = [];
  for (let i = 0; i < MAX_MONSTERS; i++) monsters.push(mkMonster(i));
}

function mkProj(x, y, vx, vy, dmg, fromPlayer, radius) {
  return { x, y, vx, vy, dmg, fromPlayer, radius: radius||6, alive: true, dist: 0,
           maxDist: fromPlayer ? 640 : 420 };
}

// ═══════════════════════════════════════════════════════════
//  INPUT
// ═══════════════════════════════════════════════════════════
function setupInput() {
  window.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    if ((screen === 'win' || screen === 'gameover') &&
        (e.key === 'r' || e.key === 'R')) {
      showScreen('lobby');
    }
  });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

  const cv = document.getElementById('gameCanvas');

  cv.addEventListener('mousemove', e => {
    const r = cv.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    mwx = sx + camX;
    mwy = sy + camY;
  });

  cv.addEventListener('click', e => {
    if (screen !== 'playing') return;
    e.preventDefault();
    useSkill(player.skills[player.skillIdx], mwx, mwy);
  });

  cv.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (screen !== 'playing') return;
    player.skillIdx = (player.skillIdx + 1) % player.skills.length;
  });
}

// ═══════════════════════════════════════════════════════════
//  COLLISION HELPERS
// ═══════════════════════════════════════════════════════════
function cc(ax, ay, ar, bx, by, br) {
  const dx = ax-bx, dy = ay-by;
  return dx*dx + dy*dy < (ar+br)*(ar+br);
}

// Move entity (has .x .y .radius) with tile-based wall collision
function moveEnt(ent, dx, dy) {
  const r  = ent.radius - 2; // slightly tighter for smoother sliding

  // X
  const nx  = ent.x + dx;
  const col = Math.floor((nx + (dx > 0 ? r : -r)) / TILE);
  const rt  = Math.floor((ent.y - r) / TILE);
  const rb  = Math.floor((ent.y + r) / TILE);
  if (!tileIsWall(col, rt) && !tileIsWall(col, rb)) ent.x = nx;

  // Y
  const ny  = ent.y + dy;
  const row = Math.floor((ny + (dy > 0 ? r : -r)) / TILE);
  const cl  = Math.floor((ent.x - r) / TILE);
  const cr  = Math.floor((ent.x + r) / TILE);
  if (!tileIsWall(cl, row) && !tileIsWall(cr, row)) ent.y = ny;

  // Clamp to map
  ent.x = Math.max(ent.radius, Math.min(MW - ent.radius, ent.x));
  ent.y = Math.max(ent.radius, Math.min(MH - ent.radius, ent.y));
}

// ═══════════════════════════════════════════════════════════
//  SKILLS
// ═══════════════════════════════════════════════════════════
function useSkill(name, wx, wy) {
  // Shield has its own CD logic
  if (name === 'shield') {
    if (player.cd.shield > 0 || player.shieldCdActive) return;
    sndShield();
    player.shieldActive  = true;
    player.shieldTimer   = SK_SHIELD_DUR;
    player.cd.shield     = SK_SHIELD_DUR + SK_SHIELD_CD; // total lock time
    player.shieldCdActive = false;
    return;
  }
  if (player.cd[name] > 0) return;

  const dx = wx - player.x;
  const dy = wy - player.y;
  const d  = Math.sqrt(dx*dx + dy*dy) || 1;
  const nx = dx/d, ny = dy/d;

  if (name === 'ranged') {
    sndRanged();
    projectiles.push(mkProj(player.x, player.y,
      nx*PROJ_SPEED, ny*PROJ_SPEED, SK_RANGED_DMG, true));
    player.cd.ranged = SK_RANGED_CD;

  } else if (name === 'melee') {
    sndMelee();
    // Visual arc effect
    effects.push({ type:'melee', x:player.x, y:player.y,
                   angle: Math.atan2(ny, nx), t: 220, max: 220 });

    monsters.forEach(m => {
      const mdx = m.x - player.x, mdy = m.y - player.y;
      const md  = Math.sqrt(mdx*mdx + mdy*mdy);
      if (md > SK_MELEE_RANGE + m.radius) return;
      if (md < 30) {
        hurtMonster(m, SK_MELEE_DMG); // always hits if very close
      } else {
        const dot = (mdx/md)*nx + (mdy/md)*ny;
        if (dot > 0.25) hurtMonster(m, SK_MELEE_DMG);
      }
    });
    player.cd.melee = SK_MELEE_CD;
  }
}

// ═══════════════════════════════════════════════════════════
//  DAMAGE
// ═══════════════════════════════════════════════════════════
function hurtPlayer(amount) {
  if (player.shieldActive) amount = Math.floor(amount * 0.5);
  player.hp = Math.max(0, player.hp - amount);
  player.hitFlash = 320;
  sndHit();
  if (player.hp <= 0) endGame(false);
}

function hurtMonster(m, amount) {
  m.hp -= amount;
  // Small visual pop
  effects.push({ type:'hit', x:m.x, y:m.y, t:180, max:180 });
  if (m.hp <= 0) killMonster(m);
}

function killMonster(m) {
  const idx = monsters.indexOf(m);
  if (idx === -1) return;
  monsters.splice(idx, 1);
  respawnQ.push({ time: performance.now(), spawnIdx: m.spawnIdx });
}

// ═══════════════════════════════════════════════════════════
//  GAME UPDATE
// ═══════════════════════════════════════════════════════════
function updateGame(dt, now) {
  updatePlayer(dt);
  updateMonsters(dt, now);
  updateProjectiles(dt);
  updateEffects(dt);
  checkWin();
}

function updatePlayer(dt) {
  const p = player;
  let dx = 0, dy = 0;
  if (keys['w'] || keys['arrowup'])    dy -= p.speed * dt;
  if (keys['s'] || keys['arrowdown'])  dy += p.speed * dt;
  if (keys['a'] || keys['arrowleft'])  dx -= p.speed * dt;
  if (keys['d'] || keys['arrowright']) dx += p.speed * dt;
  if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }
  moveEnt(p, dx, dy);

  // Cooldowns (general)
  for (const k in p.cd) {
    if (p.cd[k] > 0) p.cd[k] = Math.max(0, p.cd[k] - dt*1000);
  }

  // Shield timer (independent of cd counter)
  if (p.shieldActive) {
    p.shieldTimer -= dt*1000;
    if (p.shieldTimer <= 0) {
      p.shieldActive = false;
      p.shieldTimer  = 0;
    }
  }

  if (p.hitFlash > 0) p.hitFlash = Math.max(0, p.hitFlash - dt*1000);
}

function updateMonsters(dt, now) {
  // Respawn
  for (let i = respawnQ.length - 1; i >= 0; i--) {
    if (now - respawnQ[i].time >= M_RESPAWN_MS) {
      monsters.push(mkMonster(respawnQ[i].spawnIdx));
      respawnQ.splice(i, 1);
    }
  }

  monsters.forEach(m => {
    // Chase player
    const dx = player.x - m.x, dy = player.y - m.y;
    const d  = Math.sqrt(dx*dx + dy*dy) || 1;
    moveEnt(m, (dx/d)*m.speed*dt, (dy/d)*m.speed*dt);

    // Contact damage
    if (cc(player.x, player.y, player.radius, m.x, m.y, m.radius)) {
      if (m.contactCd <= 0) {
        hurtPlayer(M_CONTACT_DMG);
        m.contactCd = M_CONTACT_CD;
      }
    }
    if (m.contactCd > 0) m.contactCd = Math.max(0, m.contactCd - dt*1000);

    // Ranged attack
    if (m.rangedCd <= 0 && d <= M_RANGE_DIST) {
      projectiles.push(mkProj(m.x, m.y,
        (dx/d)*MPROJ_SPEED, (dy/d)*MPROJ_SPEED,
        M_RANGE_DMG, false, 5));
      m.rangedCd = M_RANGE_CD;
    }
    if (m.rangedCd > 0) m.rangedCd = Math.max(0, m.rangedCd - dt*1000);
  });
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    if (!p.alive) { projectiles.splice(i,1); continue; }

    const step = Math.sqrt(p.vx*p.vx + p.vy*p.vy) * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.dist += step;

    // Out of range
    if (p.dist >= p.maxDist) { p.alive = false; continue; }

    // Wall hit
    const tc = Math.floor(p.x/TILE), tr = Math.floor(p.y/TILE);
    if (tileIsWall(tc, tr)) {
      effects.push({ type:'spark', x:p.x, y:p.y, t:200, max:200 });
      p.alive = false; continue;
    }

    if (p.fromPlayer) {
      for (const m of monsters) {
        if (cc(p.x, p.y, p.radius, m.x, m.y, m.radius)) {
          hurtMonster(m, p.dmg);
          p.alive = false; break;
        }
      }
    } else {
      if (cc(p.x, p.y, p.radius, player.x, player.y, player.radius)) {
        hurtPlayer(p.dmg);
        p.alive = false;
      }
    }
  }
}

function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    effects[i].t -= dt*1000;
    if (effects[i].t <= 0) effects.splice(i,1);
  }
}

function checkWin() {
  const c = Math.floor(player.x / TILE);
  const r = Math.floor(player.y / TILE);
  if (getTile(c, r) === TILE_GOAL) endGame(true);
}

function endGame(won) {
  screen = won ? 'win' : 'gameover';
}

// ═══════════════════════════════════════════════════════════
//  TILE DRAWING (pixel art)
// ═══════════════════════════════════════════════════════════
// Pre-render tiles into offscreen canvases for performance
let tileCache = null;

function buildTileCache() {
  tileCache = {};

  // ── FLOOR ──
  const fc = new OffscreenCanvas(TILE, TILE);
  const ft = fc.getContext('2d');
  ft.fillStyle = '#0d0d1e';
  ft.fillRect(0, 0, TILE, TILE);
  // subtle inner border
  ft.strokeStyle = '#12122a';
  ft.lineWidth = 1;
  ft.strokeRect(0.5, 0.5, TILE-1, TILE-1);
  // corner accents
  ft.fillStyle = '#181832';
  [[2,2],[TILE-5,2],[2,TILE-5],[TILE-5,TILE-5]].forEach(([x,y]) => ft.fillRect(x,y,3,3));
  tileCache[TILE_FLOOR] = fc;

  // ── WALL ──
  const wc = new OffscreenCanvas(TILE, TILE);
  const wt = wc.getContext('2d');
  wt.fillStyle = '#252535';
  wt.fillRect(0, 0, TILE, TILE);
  // top + left highlight
  wt.fillStyle = '#3a3a50';
  wt.fillRect(0, 0, TILE, 4);
  wt.fillRect(0, 0, 4, TILE);
  // bottom + right shadow
  wt.fillStyle = '#0f0f18';
  wt.fillRect(0, TILE-4, TILE, 4);
  wt.fillRect(TILE-4, 0, 4, TILE);
  // stone centre
  wt.fillStyle = '#1e1e2e';
  wt.fillRect(5, 5, TILE-10, TILE-10);
  // brick cracks
  wt.fillStyle = '#16162a';
  wt.fillRect(5, 5,  16, 3);
  wt.fillRect(22, 5, 12, 3);
  wt.fillRect(5, 22, 10, 3);
  wt.fillRect(18, 22,18, 3);
  tileCache[TILE_WALL] = wc;

  // ── GOAL (cobblestone exit) ──
  const gc = new OffscreenCanvas(TILE, TILE);
  const gt = gc.getContext('2d');
  // base stone
  gt.fillStyle = '#5a4010';
  gt.fillRect(0, 0, TILE, TILE);
  // cobble blocks
  const stones = [[1,1,17,17],[20,1,18,17],[1,20,17,18],[20,20,18,18]];
  const cols   = ['#7a5a1e','#6a4e18','#705418','#7a5e20'];
  stones.forEach(([x,y,w,h],i) => { gt.fillStyle=cols[i]; gt.fillRect(x,y,w,h); });
  // mortar lines
  gt.fillStyle = '#3a2808';
  gt.fillRect(0,18,TILE,3); gt.fillRect(18,0,3,TILE);
  // golden glow frame
  gt.strokeStyle = '#e8c533';
  gt.lineWidth = 2;
  gt.strokeRect(2,2,TILE-4,TILE-4);
  // centre star / rune
  gt.fillStyle = '#ffe066';
  gt.fillRect(TILE/2-1,  6, 2, TILE-12);
  gt.fillRect(6, TILE/2-1, TILE-12, 2);
  gt.fillStyle = '#fff4aa';
  gt.fillRect(TILE/2-4, TILE/2-4, 8, 8);
  tileCache[TILE_GOAL] = gc;
}

// ═══════════════════════════════════════════════════════════
//  ENTITY DRAWING
// ═══════════════════════════════════════════════════════════
function drawPlayer(ctx) {
  const p = player;
  const x = p.x, y = p.y, r = P_RADIUS;

  // Hit flash ring
  if (p.hitFlash > 0) {
    ctx.save();
    ctx.globalAlpha = (p.hitFlash / 320) * 0.7;
    ctx.fillStyle = '#ff2200';
    ctx.beginPath(); ctx.arc(x, y, r+8, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  // Shield aura
  if (p.shieldActive) {
    const pulse = 0.25 + 0.15*Math.sin(Date.now()*0.008);
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#ffe040';
    ctx.beginPath(); ctx.arc(x, y, r+14, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = '#ffe040';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, r+14, 0, Math.PI*2); ctx.stroke();
    ctx.restore();
  }

  // Shadow
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(x+2, y+4, r, r*0.5, 0, 0, Math.PI*2); ctx.fill();
  ctx.restore();

  // Skin circle (head)
  ctx.fillStyle = '#f5c9a0';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();

  // Hair (top half)
  ctx.fillStyle = '#2c1810';
  ctx.beginPath();
  ctx.arc(x, y-1, r-1, Math.PI, 0);
  ctx.fillRect(x-r+1, y-2, (r-1)*2, 7);
  ctx.fill();

  // Eyes (pixel dots)
  ctx.fillStyle = '#111';
  ctx.fillRect(x-8, y+3, 4, 4);
  ctx.fillRect(x+4, y+3, 4, 4);
  ctx.fillStyle = '#4a90d9';
  ctx.fillRect(x-7, y+4, 2, 2);
  ctx.fillRect(x+5, y+4, 2, 2);

  // Outline
  ctx.strokeStyle = '#1a0a00';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.stroke();
}

function drawMonster(ctx, m) {
  const x = m.x, y = m.y, r = M_RADIUS;

  // Shadow
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(x+2, y+5, r, r*0.45, 0, 0, Math.PI*2); ctx.fill();
  ctx.restore();

  // Head (dark crimson)
  ctx.fillStyle = '#3a0000';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();

  // Outer glow rim
  ctx.strokeStyle = '#880000';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, r+1, 0, Math.PI*2); ctx.stroke();

  // Horns (pixel art bumps)
  ctx.fillStyle = '#1a0000';
  ctx.fillRect(x-13, y-r+1, 6, 9);
  ctx.fillRect(x+7,  y-r+1, 6, 9);
  ctx.fillStyle = '#550000';
  ctx.fillRect(x-12, y-r-2, 4, 5);
  ctx.fillRect(x+8,  y-r-2, 4, 5);

  // Eyes (glowing red)
  ctx.fillStyle = '#ff2200';
  ctx.fillRect(x-11, y-7, 8, 6);
  ctx.fillRect(x+3,  y-7, 8, 6);
  ctx.fillStyle = '#ff8866';
  ctx.fillRect(x-10, y-6, 6, 4);
  ctx.fillRect(x+4,  y-6, 6, 4);
  ctx.fillStyle = '#fff';
  ctx.fillRect(x-9,  y-5, 2, 2);
  ctx.fillRect(x+5,  y-5, 2, 2);

  // Teeth
  ctx.fillStyle = '#ccbbaa';
  for (let i = 0; i < 5; i++) {
    const tx = x - 10 + i*5;
    const th = (i % 2 === 0) ? 6 : 4;
    ctx.fillRect(tx, y+7, 3, th);
  }

  // HP bar
  const bw = 44, bh = 5;
  const bx = x - bw/2, by = y - r - 13;
  ctx.fillStyle = '#1a0000';
  ctx.fillRect(bx, by, bw, bh);
  const pct = m.hp / m.maxHp;
  ctx.fillStyle = pct > 0.5 ? '#cc2200' : pct > 0.25 ? '#ff6600' : '#ff0000';
  ctx.fillRect(bx, by, bw * pct, bh);
  ctx.strokeStyle = '#550000';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx, by, bw, bh);
}

function drawProjectile(ctx, p) {
  if (p.fromPlayer) {
    ctx.shadowBlur = 14; ctx.shadowColor = '#00ffff';
    ctx.fillStyle = '#00ffff';
  } else {
    ctx.shadowBlur = 14; ctx.shadowColor = '#ff6600';
    ctx.fillStyle = '#ff8800';
  }
  ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI*2); ctx.fill();
  ctx.shadowBlur = 0;
}

function drawEffects(ctx) {
  effects.forEach(e => {
    const alpha = e.t / e.max;
    ctx.save();
    ctx.globalAlpha = alpha;

    if (e.type === 'melee') {
      ctx.strokeStyle = '#ff9900';
      ctx.lineWidth = 4;
      ctx.shadowBlur = 10; ctx.shadowColor = '#ff9900';
      ctx.beginPath();
      ctx.arc(e.x, e.y, SK_MELEE_RANGE, e.angle - Math.PI/3, e.angle + Math.PI/3);
      ctx.stroke();
      ctx.shadowBlur = 0;

    } else if (e.type === 'hit') {
      ctx.fillStyle = '#ffcc00';
      ctx.beginPath(); ctx.arc(e.x, e.y, 12*(1-alpha)+4, 0, Math.PI*2); ctx.fill();

    } else if (e.type === 'spark') {
      ctx.fillStyle = '#ff8800';
      for (let i = 0; i < 4; i++) {
        const a = (i/4)*Math.PI*2;
        ctx.fillRect(e.x + Math.cos(a)*8*(1-alpha), e.y + Math.sin(a)*8*(1-alpha), 3, 3);
      }
    }
    ctx.restore();
  });
}

// ═══════════════════════════════════════════════════════════
//  HUD
// ═══════════════════════════════════════════════════════════
function drawHUD(ctx, sw, sh) {
  // ── Player HP bar (top-left) ──
  const bw = 220, bh = 22, bx = 12, by = 12;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(bx-2, by-2, bw+4, bh+4);
  const pct = player.hp / player.maxHp;
  const hcol = pct > 0.6 ? '#00cc44' : pct > 0.3 ? '#ffcc00' : '#ff2200';
  ctx.fillStyle = '#111';
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = hcol;
  ctx.fillRect(bx, by, bw * pct, bh);
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx, by, bw, bh);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px "Courier New"';
  ctx.textAlign = 'center';
  ctx.fillText(`HP  ${player.hp.toLocaleString()} / ${player.maxHp.toLocaleString()}`, bx + bw/2, by + 15);

  // Shield timer (below HP)
  if (player.shieldActive) {
    ctx.fillStyle = '#ffe040';
    ctx.font = 'bold 12px "Courier New"';
    ctx.textAlign = 'left';
    ctx.fillText(`SHIELD  ${(player.shieldTimer/1000).toFixed(1)} s`, bx, by + bh + 16);
  }

  // ── Skill bar (bottom-right) ──
  const slotW = 58, slotH = 58, gap = 8, pad = 12;
  const totalW = player.skills.length * (slotW + gap) - gap;
  const barX = sw - totalW - pad;
  const barY = sh - slotH - pad;

  player.skills.forEach((name, idx) => {
    const sx = barX + idx * (slotW + gap);
    const sy = barY;
    const active = idx === player.skillIdx;
    const cdVal  = player.cd[name] || 0;

    // Background
    ctx.fillStyle = active ? '#2a2a00' : 'rgba(0,0,0,0.75)';
    ctx.fillRect(sx, sy, slotW, slotH);

    // Icon
    drawSkillIcon(ctx, name, sx + slotW/2, sy + slotH/2 - 5, 18);

    // Cooldown overlay
    const maxCd = (name === 'shield') ? (SK_SHIELD_DUR + SK_SHIELD_CD) : SK_RANGED_CD;
    if (cdVal > 0) {
      const frac = cdVal / maxCd;
      ctx.fillStyle = 'rgba(0,0,0,0.68)';
      ctx.fillRect(sx, sy, slotW, slotH * frac);
      ctx.fillStyle = '#ccc';
      ctx.font = 'bold 13px "Courier New"';
      ctx.textAlign = 'center';
      ctx.fillText((cdVal/1000).toFixed(1), sx + slotW/2, sy + slotH/2 + 5);
    }

    // Border
    ctx.strokeStyle = active ? '#ffe040' : '#555';
    ctx.lineWidth   = active ? 3 : 1;
    ctx.strokeRect(sx, sy, slotW, slotH);

    // Slot number
    ctx.fillStyle = active ? '#ffe040' : '#888';
    ctx.font = 'bold 10px "Courier New"';
    ctx.textAlign = 'left';
    ctx.fillText(String(idx+1), sx+4, sy+13);

    // Skill name
    ctx.fillStyle = active ? '#ffe' : '#777';
    ctx.font = '9px "Courier New"';
    ctx.textAlign = 'center';
    ctx.fillText(name.toUpperCase(), sx + slotW/2, sy + slotH - 5);
  });

  // Minimap hint arrow  (shows direction to goal)
  drawGoalArrow(ctx, sw, sh);
}

function drawSkillIcon(ctx, name, cx, cy, sz) {
  if (name === 'ranged') {
    ctx.strokeStyle = '#00ccff'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(cx-sz, cy); ctx.lineTo(cx+sz, cy); ctx.stroke();
    ctx.fillStyle = '#00ccff';
    ctx.beginPath(); ctx.moveTo(cx+sz,cy); ctx.lineTo(cx+sz-9,cy-5); ctx.lineTo(cx+sz-9,cy+5); ctx.closePath(); ctx.fill();

  } else if (name === 'melee') {
    ctx.strokeStyle = '#ff8800'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx-sz+4,cy+sz-4); ctx.lineTo(cx+sz-4,cy-sz+4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx-9,cy+4); ctx.lineTo(cx+9,cy-4); ctx.stroke();

  } else if (name === 'shield') {
    ctx.fillStyle = '#ffe040';
    ctx.beginPath();
    ctx.moveTo(cx,      cy-sz);
    ctx.lineTo(cx+sz,   cy-sz/3);
    ctx.lineTo(cx+sz,   cy+sz/3);
    ctx.lineTo(cx,      cy+sz);
    ctx.lineTo(cx-sz,   cy+sz/3);
    ctx.lineTo(cx-sz,   cy-sz/3);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle='#aa8800'; ctx.lineWidth=1.5; ctx.stroke();
  }
}

function drawGoalArrow(ctx, sw, sh) {
  // Compass-style arrow pointing from player toward goal
  const gx = GOAL_COL * TILE + TILE/2;
  const gy = GOAL_ROW * TILE + TILE/2;
  const dx = gx - player.x, dy = gy - player.y;
  const ang = Math.atan2(dy, dx);
  const cx = 48, cy = sh - 48, len = 28;

  ctx.save();
  ctx.translate(cx, cy);
  // circle
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath(); ctx.arc(0,0,32,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#555'; ctx.lineWidth=1; ctx.stroke();
  // arrow
  ctx.rotate(ang);
  ctx.strokeStyle = '#e8c533'; ctx.lineWidth=2.5;
  ctx.beginPath(); ctx.moveTo(-len+6,0); ctx.lineTo(len-4,0); ctx.stroke();
  ctx.fillStyle = '#e8c533';
  ctx.beginPath(); ctx.moveTo(len-4,0); ctx.lineTo(len-14,-6); ctx.lineTo(len-14,6); ctx.closePath(); ctx.fill();
  ctx.restore();

  // Label
  const dist = Math.round(Math.sqrt(dx*dx+dy*dy));
  ctx.fillStyle = '#aaa';
  ctx.font = '10px "Courier New"';
  ctx.textAlign = 'center';
  ctx.fillText('EXIT', cx, cy + 44);
  ctx.fillText(`${dist}px`, cx, cy + 56);
}

// ═══════════════════════════════════════════════════════════
//  MAP RENDERING
// ═══════════════════════════════════════════════════════════
function drawMap(ctx, sw, sh) {
  const startC = Math.max(0, Math.floor(camX / TILE));
  const endC   = Math.min(MCOLS-1, Math.ceil((camX + sw) / TILE));
  const startR = Math.max(0, Math.floor(camY / TILE));
  const endR   = Math.min(MROWS-1, Math.ceil((camY + sh) / TILE));

  for (let r = startR; r <= endR; r++) {
    for (let c = startC; c <= endC; c++) {
      const tile = mapTiles[r][c];
      const wx = c * TILE, wy = r * TILE;
      if (tileCache && tileCache[tile]) {
        ctx.drawImage(tileCache[tile], wx, wy);
      } else {
        ctx.fillStyle = tile === TILE_WALL ? '#252535' : tile === TILE_GOAL ? '#7a5a1e' : '#0d0d1e';
        ctx.fillRect(wx, wy, TILE, TILE);
      }

      // Animated goal glow
      if (tile === TILE_GOAL) {
        const pulse = 0.2 + 0.15*Math.sin(Date.now()*0.004);
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.fillStyle = '#ffe040';
        ctx.fillRect(wx, wy, TILE, TILE);
        ctx.restore();
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════
//  FULL RENDER
// ═══════════════════════════════════════════════════════════
function renderGame(ctx, sw, sh) {
  // Update camera (player centred)
  camX = Math.max(0, Math.min(MW - sw, player.x - sw/2));
  camY = Math.max(0, Math.min(MH - sh, player.y - sh/2));

  ctx.clearRect(0, 0, sw, sh);
  ctx.save();
  ctx.translate(-camX, -camY);

  drawMap(ctx, sw, sh);
  drawEffects(ctx);
  projectiles.forEach(p => { if (p.alive) drawProjectile(ctx, p); });
  monsters.forEach(m => drawMonster(ctx, m));
  drawPlayer(ctx);

  ctx.restore();

  drawHUD(ctx, sw, sh);
}

function drawEndScreen(ctx, won, sw, sh) {
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillRect(0, 0, sw, sh);

  ctx.textAlign = 'center';
  if (won) {
    ctx.fillStyle = '#e8c533';
    ctx.font = 'bold 56px "Courier New"';
    ctx.fillText('YOU WIN!', sw/2, sh/2 - 36);
    ctx.fillStyle = '#aaa';
    ctx.font = '20px "Courier New"';
    ctx.fillText('You escaped the dungeon!', sw/2, sh/2 + 18);
  } else {
    ctx.fillStyle = '#cc2200';
    ctx.font = 'bold 56px "Courier New"';
    ctx.fillText('GAME OVER', sw/2, sh/2 - 36);
    ctx.fillStyle = '#aaa';
    ctx.font = '20px "Courier New"';
    ctx.fillText('You were slain by the darkness...', sw/2, sh/2 + 18);
  }
  ctx.fillStyle = '#555';
  ctx.font = '15px "Courier New"';
  ctx.fillText('Press  R  to return to lobby', sw/2, sh/2 + 66);
}

// ═══════════════════════════════════════════════════════════
//  GAME LOOP
// ═══════════════════════════════════════════════════════════
let canvas, ctx2d;

function loop(ts) {
  if (!lastTime) lastTime = ts;
  const dt = Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;

  if (screen === 'playing') {
    updateGame(dt, ts);
    renderGame(ctx2d, canvas.width, canvas.height);
  } else if (screen === 'win' || screen === 'gameover') {
    renderGame(ctx2d, canvas.width, canvas.height);
    drawEndScreen(ctx2d, screen === 'win', canvas.width, canvas.height);
  }

  requestAnimationFrame(loop);
}

// ═══════════════════════════════════════════════════════════
//  SCREEN MANAGEMENT
// ═══════════════════════════════════════════════════════════
function showScreen(name) {
  screen = name;
  const overlay = document.getElementById('ui-overlay');
  const cv      = document.getElementById('gameCanvas');

  if (name === 'playing' || name === 'win' || name === 'gameover') {
    overlay.classList.add('hidden');
    cv.style.display = 'block';
  } else {
    overlay.classList.remove('hidden');
    cv.style.display = 'none';
  }

  // Sub-screens inside overlay
  ['lobby','howtoplay','skillorder'].forEach(id => {
    const el = document.getElementById(id + '-screen');
    if (el) el.classList.toggle('hidden', id !== name);
  });
}

function startGame() {
  initMap();
  if (!tileCache) buildTileCache();

  // Reset player
  player.x    = MW / 2;
  player.y    = MH / 2;
  player.hp   = P_MAX_HP;
  player.skills   = [...orderedSkills];
  player.skillIdx = 0;
  player.cd   = { ranged: 0, melee: 0, shield: 0 };
  player.shieldActive    = false;
  player.shieldTimer     = 0;
  player.shieldCdActive  = false;
  player.hitFlash        = 0;

  initMonsters();
  projectiles = [];
  effects     = [];
  lastTime    = 0;

  showScreen('playing');
}

// ═══════════════════════════════════════════════════════════
//  SKILL ORDER UI (drag-and-drop)
// ═══════════════════════════════════════════════════════════
const SKILL_META = {
  ranged: { label: 'Ranged Attack', icon: '🏹', desc: 'DMG 1000 · CD 2 s · Fires a projectile toward cursor' },
  melee:  { label: 'Melee Attack',  icon: '⚔️',  desc: 'DMG 2000 · CD 2 s · Strikes a short-range cone' },
  shield: { label: 'Shield',        icon: '🛡️',  desc: '50 % dmg reduction · 3 s active · 5 s cooldown' },
};

let dragSrc = null;

function buildSkillOrderUI() {
  const list = document.getElementById('skill-list');
  list.innerHTML = '';

  orderedSkills.forEach((name, idx) => {
    const item = document.createElement('div');
    item.className   = 'skill-item';
    item.draggable   = true;
    item.dataset.idx = idx;

    const meta = SKILL_META[name];
    const iconClass = `icon-${name}`;

    item.innerHTML = `
      <div class="skill-num">Slot ${idx+1}</div>
      <div class="skill-icon-box ${iconClass}">${meta.icon}</div>
      <div class="skill-info">
        <div class="skill-name">${meta.label}</div>
        <div class="skill-desc">${meta.desc}</div>
      </div>`;

    // ── Drag events ──
    item.addEventListener('dragstart', () => {
      dragSrc = idx;
      item.classList.add('dragging');
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      dragSrc = null;
    });
    item.addEventListener('dragover', e => {
      e.preventDefault();
      item.classList.add('drag-over');
    });
    item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
    item.addEventListener('drop', e => {
      e.preventDefault();
      item.classList.remove('drag-over');
      const dest = parseInt(item.dataset.idx, 10);
      if (dragSrc !== null && dragSrc !== dest) {
        [orderedSkills[dragSrc], orderedSkills[dest]] =
          [orderedSkills[dest],  orderedSkills[dragSrc]];
        buildSkillOrderUI(); // rebuild with new order
      }
    });

    list.appendChild(item);
  });
}

// ═══════════════════════════════════════════════════════════
//  BOOTSTRAP
// ═══════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('gameCanvas');
  ctx2d  = canvas.getContext('2d');
  ctx2d.imageSmoothingEnabled = false;

  function resizeCanvas() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  setupInput();

  // Lobby
  document.getElementById('btn-start').addEventListener('click', () => {
    showScreen('skillorder');
    buildSkillOrderUI();
  });
  document.getElementById('btn-howtoplay').addEventListener('click', () => {
    showScreen('howtoplay');
  });
  document.getElementById('btn-back').addEventListener('click', () => {
    showScreen('lobby');
  });
  document.getElementById('btn-confirm').addEventListener('click', () => {
    startGame();
  });

  showScreen('lobby');
  requestAnimationFrame(loop);
});
