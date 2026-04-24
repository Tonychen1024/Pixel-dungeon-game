// =============================================================================
// PIXEL DUNGEON GAME  –  Single-file canvas implementation
// =============================================================================

// ─── Constants ───────────────────────────────────────────────────────────────
const TILE            = 32;          // px per map tile
const MAP_COLS        = 75;
const MAP_ROWS        = 56;
const MAP_W           = MAP_COLS * TILE;  // 2400
const MAP_H           = MAP_ROWS * TILE;  // 1792

const PLAYER_SPEED    = 220;   // px/s
const PLAYER_MAX_HP   = 10000;

const MON_SPEED       = 90;
const MON_MAX_HP      = 5000;
const MAX_MONSTERS    = 5;
const MON_RESPAWN     = 5;     // s

const PROJ_SPEED      = 380;
const MON_PROJ_SPEED  = 200;

// Tile IDs
const T_FLOOR = 0;
const T_WALL  = 1;
const T_DEST  = 2;   // destination cobblestone
const T_STONE = 3;   // decorative dark stone

// Game states
const S_LOBBY       = 'lobby';
const S_HOW         = 'howToPlay';
const S_SKILL_ORDER = 'skillOrder';
const S_PLAYING     = 'playing';
const S_WIN         = 'win';
const S_DEAD        = 'dead';

// ─── Colour palette ──────────────────────────────────────────────────────────
const C = {
  bg:       '#0d0d1a',
  floor:    '#16162a',
  floor2:   '#1a1a30',
  wall:     '#2a2a3f',
  wallDark: '#1a1a2d',
  dest:     '#8b6914',
  destHigh: '#c49a1e',
  player:   '#5bc8f5',
  playerDark:'#2d7fa8',
  shield:   'rgba(255,230,0,0.35)',
  shieldBorder:'#ffe000',
  monBody:  '#7b1010',
  monDark:  '#4a0808',
  monEye:   '#ff2020',
  monPupil: '#ffff00',
  bullet:   '#00e5ff',
  monBullet:'#ff6600',
  hpRed:    '#c62828',
  hpGreen:  '#2e7d32',
  hpYellow: '#f9a825',
  uiBg:     'rgba(0,0,0,0.75)',
  uiBorder: '#444466',
  text:     '#e0e0f0',
  textDim:  '#8888aa',
  highlight:'#ffd700',
  overlay:  'rgba(0,0,0,0.72)',
};

// ─── Skill definitions ────────────────────────────────────────────────────────
const SKILL_DEFS = [
  { id:1, name:'Ranged Attack', desc:'Shoot a bullet toward cursor.\nDamage: 1000 | CD: 2s',
    color:'#00e5ff', iconColor:'#00b8d4' },
  { id:2, name:'Melee Attack',  desc:'Slash nearby enemies.\nDamage: 2000 | CD: 2s',
    color:'#ff7043', iconColor:'#d84315' },
  { id:3, name:'Shield',        desc:'Create protective aura.\n50% damage reduction | Duration: 3s | CD: 5s',
    color:'#ffd700', iconColor:'#f9a825' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Audio (Web Audio API procedural sound effects)
// ─────────────────────────────────────────────────────────────────────────────
class AudioSys {
  constructor() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.ready = true;
    } catch(e) { this.ready = false; }
  }
  _resume() {
    if (this.ready && this.ctx.state === 'suspended') this.ctx.resume();
  }
  _osc(freq, type, dur, gainVal, startFreq) {
    if (!this.ready) return;
    this._resume();
    const g = this.ctx.createGain();
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(startFreq || freq, this.ctx.currentTime);
    if (startFreq) o.frequency.exponentialRampToValueAtTime(freq, this.ctx.currentTime + dur * 0.6);
    g.gain.setValueAtTime(gainVal, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g);
    g.connect(this.ctx.destination);
    o.start();
    o.stop(this.ctx.currentTime + dur);
  }
  _noise(dur, gainVal, freqLow, freqHigh) {
    if (!this.ready) return;
    this._resume();
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = (freqLow + freqHigh) / 2;
    filt.Q.value = 0.5;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gainVal, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.ctx.destination);
    src.start();
    src.stop(this.ctx.currentTime + dur);
  }
  shoot()    { this._osc(900, 'square', 0.15, 0.3, 1400); }
  melee()    { this._noise(0.12, 0.5, 200, 800); this._osc(180, 'sawtooth', 0.12, 0.25); }
  hit()      { this._osc(120, 'sawtooth', 0.2, 0.4, 80); this._noise(0.15, 0.3, 80, 300); }
  shieldOn() { this._osc(600, 'sine', 0.3, 0.25, 300); }
  monShoot() { this._osc(300, 'square', 0.12, 0.2, 500); }
  win()      { [440,550,660,880].forEach((f,i)=> setTimeout(()=>this._osc(f,'sine',0.35,0.3), i*120)); }
  die()      { this._osc(80, 'sawtooth', 1.0, 0.5, 180); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Map
// ─────────────────────────────────────────────────────────────────────────────
// Fixed map layout (0=floor,1=wall,2=dest,3=stone floor variant)
// We build it procedurally but with a fixed seed for the "fixed map" feel.
function buildMap() {
  const map = [];
  for (let r = 0; r < MAP_ROWS; r++) {
    map[r] = new Array(MAP_COLS).fill(T_FLOOR);
  }

  function setWall(r,c) { if(r>=0&&r<MAP_ROWS&&c>=0&&c<MAP_COLS) map[r][c]=T_WALL; }
  function fillWall(r1,c1,r2,c2) {
    for(let r=r1;r<=r2;r++) for(let c=c1;c<=c2;c++) setWall(r,c);
  }
  function fillFloor(r1,c1,r2,c2) {
    for(let r=r1;r<=r2;r++) for(let c=c1;c<=c2;c++) if(r>=0&&r<MAP_ROWS&&c>=0&&c<MAP_COLS) map[r][c]=T_FLOOR;
  }

  // Border walls
  for(let c=0;c<MAP_COLS;c++) { map[0][c]=T_WALL; map[MAP_ROWS-1][c]=T_WALL; }
  for(let r=0;r<MAP_ROWS;r++) { map[r][0]=T_WALL; map[r][MAP_COLS-1]=T_WALL; }

  // Stone floor variant patches (decorative)
  for(let r=3;r<MAP_ROWS-3;r+=7) for(let c=3;c<MAP_COLS-3;c+=9) map[r][c]=T_STONE;

  // ── Interior obstacle walls ──────────────────────────────────────────────
  // Top-left room
  fillWall(4,4,10,4); fillWall(4,4,4,12); fillWall(10,4,10,10); fillWall(4,12,10,12);
  fillFloor(5,5,9,11);  // carve interior

  // Top-right cluster
  fillWall(3,55,3,65); fillWall(3,55,14,55); fillWall(3,65,14,65); fillWall(14,55,14,65);
  fillFloor(4,56,13,64);
  setWall(8,56); setWall(8,57); setWall(8,58); // interior pillars

  // Middle-left passage
  fillWall(20,2,20,20); fillWall(20,2,32,2); fillWall(32,2,32,20); fillWall(20,20,32,20);
  fillFloor(21,3,31,19);
  fillWall(25,3,25,12); fillWall(26,3,26,12); // split corridor
  fillFloor(25,6,26,9);

  // Centre cross walls
  fillWall(18,30,28,30); fillWall(18,30,18,44); fillWall(28,30,28,44); fillWall(18,44,28,44);
  fillFloor(19,31,27,43);
  fillWall(22,31,22,38); fillWall(22,38,26,38);

  // Bottom cluster
  fillWall(38,10,38,28); fillWall(48,10,48,28); fillWall(38,10,48,10); fillWall(38,28,48,28);
  fillFloor(39,11,47,27);
  fillWall(42,11,42,22); fillWall(44,15,44,27);

  // Right-side maze
  fillWall(30,58,42,58); fillWall(30,70,42,70); fillWall(30,58,30,70); fillWall(42,58,42,70);
  fillFloor(31,59,41,69);
  fillWall(34,59,34,66); fillWall(37,63,37,69);
  fillFloor(34,64,34,65); // gap in inner wall

  // Scattered pillars
  for(const [r,c] of [
    [6,25],[6,26],[7,25],[7,26],
    [14,8],[14,9],[15,8],[15,9],
    [16,35],[16,36],
    [34,33],[34,34],
    [44,35],[44,36],[45,35],[45,36],
    [50,50],[50,51],[51,50],[51,51],
    [10,50],[10,51],[11,50],[11,51],
  ]) setWall(r,c);

  // Long corridor walls
  fillWall(35,35,35,55);
  fillWall(36,35,36,55);
  fillFloor(35,40,35,48); // gap

  // ── Destination ──────────────────────────────────────────────────────────
  // Place destination on the right edge, rows 26-28 (opening)
  // Wall guard at col 71-72, rows 24-30, with gap at rows 26-28
  fillWall(24,71,30,71);
  fillWall(24,72,30,72);
  fillFloor(26,71,28,72); // gate opening
  // Destination tiles beyond the gate (columns 73-74)
  for(let r=26;r<=28;r++) for(let c=73;c<=74;c++) map[r][c]=T_DEST;
  // Outer wall already set by border

  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// Entities
// ─────────────────────────────────────────────────────────────────────────────
class Player {
  constructor(x,y) {
    this.x = x; this.y = y;
    this.r = 14;        // radius
    this.hp = PLAYER_MAX_HP;
    this.maxHp = PLAYER_MAX_HP;
    this.skillOrder = [0,1,2]; // indices into SKILL_DEFS
    this.activeSkillSlot = 0;  // which slot (0-2)
    this.cooldowns = [0,0,0];  // per SKILL_DEFS index
    this.shieldActive = false;
    this.shieldTimer  = 0;
    this.hitFlash = 0;
    this.invuln = 0;   // brief invuln after shield-related hits
  }
  get activeSkillDef() { return SKILL_DEFS[this.skillOrder[this.activeSkillSlot]]; }
  cycleSkill() { this.activeSkillSlot = (this.activeSkillSlot + 1) % 3; }
  cdOf(slotIndex) { return this.cooldowns[this.skillOrder[slotIndex]]; }
  update(dt) {
    this.cooldowns = this.cooldowns.map(c => Math.max(0,c-dt));
    if (this.shieldActive) {
      this.shieldTimer -= dt;
      if (this.shieldTimer <= 0) {
        this.shieldActive = false;
      }
    }
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.invuln > 0)   this.invuln   -= dt;
  }
  takeDamage(dmg) {
    if (this.invuln > 0) return 0;
    const actual = this.shieldActive ? Math.floor(dmg * 0.5) : dmg;
    this.hp = Math.max(0, this.hp - actual);
    this.hitFlash = 0.2;
    return actual;
  }
}

class Monster {
  constructor(id, x, y) {
    this.id = id;
    this.x  = x; this.y = y;
    this.r  = 16;
    this.hp = MON_MAX_HP; this.maxHp = MON_MAX_HP;
    this.alive = true;
    this.respawnTimer = 0;
    this.collisionCd = 0;
    this.rangedCd    = Math.random() * 2; // stagger initial attacks
    this.hitFlash    = 0;
    // Slight speed variation
    this.speed = MON_SPEED + (Math.random()-0.5)*20;
    // Animation
    this.animTimer = Math.random()*Math.PI*2;
  }
  update(dt) {
    if (!this.alive) {
      this.respawnTimer -= dt;
      return;
    }
    this.collisionCd = Math.max(0, this.collisionCd - dt);
    this.rangedCd    = Math.max(0, this.rangedCd    - dt);
    if (this.hitFlash > 0) this.hitFlash -= dt;
    this.animTimer += dt * 3;
  }
  takeDamage(dmg) {
    this.hp = Math.max(0, this.hp - dmg);
    this.hitFlash = 0.15;
    if (this.hp <= 0) {
      this.alive = false;
      this.respawnTimer = MON_RESPAWN;
    }
    return dmg;
  }
}

class Projectile {
  constructor(x,y,vx,vy,dmg,owner,r) {
    this.x=x; this.y=y; this.vx=vx; this.vy=vy;
    this.dmg=dmg; this.owner=owner; // 'player' | 'monster'
    this.r = r||6;
    this.alive=true;
    this.age=0;
  }
  update(dt,map) {
    this.x += this.vx*dt;
    this.y += this.vy*dt;
    this.age += dt;
    if(this.age > 3) { this.alive=false; return; }
    // Wall collision
    const tc = Math.floor(this.x/TILE), tr = Math.floor(this.y/TILE);
    if(tc<0||tc>=MAP_COLS||tr<0||tr>=MAP_ROWS||map[tr][tc]===T_WALL) {
      this.alive=false;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendering helpers
// ─────────────────────────────────────────────────────────────────────────────
function drawPixelRect(ctx,x,y,w,h,color) {
  ctx.fillStyle=color; ctx.fillRect(Math.floor(x),Math.floor(y),w,h);
}

function drawRoundRect(ctx,x,y,w,h,r,color,stroke,strokeColor) {
  ctx.beginPath();
  ctx.roundRect(x,y,w,h,r);
  ctx.fillStyle=color; ctx.fill();
  if(stroke){ ctx.strokeStyle=strokeColor; ctx.lineWidth=stroke; ctx.stroke(); }
}

function pixelText(ctx,text,x,y,size,color,align) {
  ctx.font = `${size}px "Courier New",monospace`;
  ctx.fillStyle = color;
  ctx.textAlign = align||'left';
  ctx.textBaseline = 'top';
  ctx.fillText(text,x,y);
}

function pixelTextCenter(ctx,text,x,y,size,color) {
  ctx.font = `${size}px "Courier New",monospace`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text,x,y);
}

// Draw player (top-down head view)
function drawPlayer(ctx,px,py,player) {
  const x=Math.floor(px), y=Math.floor(py);
  const flash = player.hitFlash > 0;

  // Shadow
  ctx.save();
  ctx.globalAlpha=0.35;
  ctx.fillStyle='#000';
  ctx.beginPath(); ctx.ellipse(x,y+4,player.r,6,0,0,Math.PI*2); ctx.fill();
  ctx.restore();

  // Body (dark)
  ctx.fillStyle = flash ? '#ff4444' : C.playerDark;
  ctx.beginPath(); ctx.arc(x,y,player.r,0,Math.PI*2); ctx.fill();

  // Head colour
  ctx.fillStyle = flash ? '#ff8888' : C.player;
  ctx.beginPath(); ctx.arc(x,y,player.r-3,0,Math.PI*2); ctx.fill();

  // Hair highlights (pixel-art style)
  ctx.fillStyle = '#1a5f7a';
  for(const [dx,dy,w,h] of [[-4,-8,8,3],[-6,-4,3,3],[3,-4,3,3]]) {
    ctx.fillRect(x+dx,y+dy,w,h);
  }

  // Eyes
  ctx.fillStyle='#0a0a20';
  ctx.fillRect(x-5,y-2,3,3); ctx.fillRect(x+2,y-2,3,3);

  // Shield aura
  if (player.shieldActive) {
    const pulse = 0.7 + 0.3*Math.sin(Date.now()*0.008);
    ctx.save();
    ctx.globalAlpha = 0.5 * pulse;
    ctx.fillStyle = C.shieldBorder;
    ctx.beginPath(); ctx.arc(x,y,player.r+12+pulse*4,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = C.shieldBorder;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x,y,player.r+12,0,Math.PI*2); ctx.stroke();
    ctx.restore();
  }

  // HP bar above
  drawHpBar(ctx, x-24, y-player.r-10, 48, 5, player.hp/player.maxHp);
}

// Draw monster (horror pixel-art head)
function drawMonster(ctx,mon) {
  const x=Math.floor(mon.x), y=Math.floor(mon.y);
  const t=mon.animTimer;
  const flash = mon.hitFlash > 0;
  const bob = Math.sin(t)*2;

  // Shadow
  ctx.save(); ctx.globalAlpha=0.3;
  ctx.fillStyle='#000';
  ctx.beginPath(); ctx.ellipse(x,y+mon.r*0.6+4,mon.r-2,5,0,0,Math.PI*2); ctx.fill();
  ctx.restore();

  // Outer skull
  ctx.fillStyle = flash ? '#ff2222' : C.monDark;
  ctx.beginPath(); ctx.arc(x,y+bob,mon.r,0,Math.PI*2); ctx.fill();

  // Face
  ctx.fillStyle = flash ? '#ff5555' : C.monBody;
  ctx.beginPath(); ctx.arc(x,y+bob,mon.r-3,0,Math.PI*2); ctx.fill();

  // Glowing red eyes
  ctx.fillStyle = C.monEye;
  ctx.fillRect(x-6,y+bob-4,5,4); ctx.fillRect(x+1,y+bob-4,5,4);
  // Pupils
  ctx.fillStyle = C.monPupil;
  ctx.fillRect(x-5,y+bob-3,3,2); ctx.fillRect(x+2,y+bob-3,3,2);
  // Glow
  ctx.save(); ctx.globalAlpha=0.4;
  ctx.fillStyle=C.monEye;
  ctx.beginPath(); ctx.arc(x-4,y+bob-2,5,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(x+4,y+bob-2,5,0,Math.PI*2); ctx.fill();
  ctx.restore();

  // Teeth
  ctx.fillStyle='#ccccaa';
  for(let i=0;i<4;i++) ctx.fillRect(x-5+i*3,y+bob+5,2,3);
  ctx.fillStyle='#555544';
  for(let i=0;i<3;i++) ctx.fillRect(x-3+i*3,y+bob+5,1,3);

  // Horns
  ctx.fillStyle=C.monDark;
  ctx.fillRect(x-9,y+bob-mon.r,3,7); ctx.fillRect(x+6,y+bob-mon.r,3,7);
  ctx.fillRect(x-8,y+bob-mon.r-3,2,4); ctx.fillRect(x+6,y+bob-mon.r-3,2,4);

  // HP bar
  drawHpBar(ctx, x-24, y-mon.r-10, 48, 5, mon.hp/mon.maxHp);
}

function drawHpBar(ctx,x,y,w,h,pct) {
  ctx.fillStyle='#222'; ctx.fillRect(x,y,w,h);
  const col = pct>0.5 ? C.hpGreen : pct>0.25 ? C.hpYellow : C.hpRed;
  ctx.fillStyle=col; ctx.fillRect(x,y,Math.floor(w*pct),h);
  ctx.strokeStyle='#000'; ctx.lineWidth=1; ctx.strokeRect(x,y,w,h);
}

// Draw map tiles
function drawMap(ctx,map,camX,camY,canvasW,canvasH) {
  const startC = Math.max(0, Math.floor(camX/TILE)-1);
  const endC   = Math.min(MAP_COLS-1, Math.ceil((camX+canvasW)/TILE)+1);
  const startR = Math.max(0, Math.floor(camY/TILE)-1);
  const endR   = Math.min(MAP_ROWS-1, Math.ceil((camY+canvasH)/TILE)+1);

  for(let r=startR; r<=endR; r++) {
    for(let c=startC; c<=endC; c++) {
      const sx = c*TILE - camX;
      const sy = r*TILE - camY;
      const t  = map[r][c];
      drawTile(ctx, sx, sy, t, c, r);
    }
  }
}

function drawTile(ctx,sx,sy,t,c,r) {
  const x=Math.floor(sx), y=Math.floor(sy), s=TILE;
  if (t===T_WALL) {
    ctx.fillStyle = C.wall;
    ctx.fillRect(x,y,s,s);
    // Shading edges (pixel-art bevel)
    ctx.fillStyle = C.wallDark;
    ctx.fillRect(x,y+s-2,s,2);    // bottom shadow
    ctx.fillRect(x+s-2,y,2,s);    // right shadow
    ctx.fillStyle='#363652';
    ctx.fillRect(x,y,s,2);        // top highlight
    ctx.fillRect(x,y,2,s);        // left highlight
    // Mortar lines
    ctx.fillStyle = C.wallDark;
    if((c+r)%4===0) { ctx.fillRect(x+TILE/2,y,1,s); ctx.fillRect(x,y+TILE/2,s,1); }
  } else if (t===T_DEST) {
    // Old cobblestone / destination
    const cob = ((c+r)%2===0);
    ctx.fillStyle = cob ? C.dest : '#7a5a10';
    ctx.fillRect(x,y,s,s);
    // Cobble grout lines
    ctx.fillStyle='#5a3e08';
    ctx.fillRect(x,y,s,1); ctx.fillRect(x,y,1,s);
    ctx.fillRect(x+s/2,y,1,s); ctx.fillRect(x,y+s/2,s,1);
    // Shimmer
    const pulse = 0.5+0.5*Math.sin(Date.now()*0.003+(c+r)*0.8);
    ctx.save(); ctx.globalAlpha=0.15*pulse;
    ctx.fillStyle=C.destHigh; ctx.fillRect(x+2,y+2,s-4,s-4);
    ctx.restore();
    // Label hint
    ctx.save(); ctx.globalAlpha=0.55*pulse;
    pixelTextCenter(ctx,'★',x+s/2,y+s/2,14,C.destHigh);
    ctx.restore();
  } else if (t===T_STONE) {
    // Decorative dark stone (floor variant)
    ctx.fillStyle='#141428'; ctx.fillRect(x,y,s,s);
    ctx.fillStyle='#101022'; ctx.fillRect(x+1,y+1,s-2,s-2);
    ctx.fillStyle='#1a1a35'; ctx.fillRect(x+3,y+3,4,4);
  } else {
    // Floor — simple dark tile with subtle grid
    const even = (c+r)%2===0;
    ctx.fillStyle = even ? C.floor : C.floor2;
    ctx.fillRect(x,y,s,s);
    // Subtle border
    ctx.fillStyle='rgba(0,0,0,0.25)';
    ctx.fillRect(x,y,s,1); ctx.fillRect(x,y,1,s);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Skill icon drawing
// ─────────────────────────────────────────────────────────────────────────────
function drawSkillIcon(ctx,x,y,w,h,def,active,cdFrac) {
  const border = active ? C.highlight : C.uiBorder;
  const bg     = active ? 'rgba(60,50,0,0.9)' : 'rgba(15,15,30,0.9)';
  // Background
  ctx.fillStyle=bg; ctx.fillRect(x,y,w,h);
  ctx.strokeStyle=border; ctx.lineWidth=active?2:1; ctx.strokeRect(x,y,w,h);

  // Icon
  const cx=x+w/2, cy=y+h/2;
  if (def.id===1) {
    // Bullet / arrow icon
    ctx.fillStyle=def.iconColor;
    ctx.fillRect(cx-12,cy-2,18,4);
    ctx.fillRect(cx+4,cy-4,6,8);
    // arrowhead
    ctx.beginPath(); ctx.moveTo(cx+8,cy-7); ctx.lineTo(cx+16,cy); ctx.lineTo(cx+8,cy+7); ctx.closePath();
    ctx.fillStyle=def.color; ctx.fill();
  } else if (def.id===2) {
    // Sword icon
    ctx.fillStyle=def.iconColor;
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(Math.PI/4);
    ctx.fillRect(-2,-14,4,28);
    ctx.fillRect(-6,-4,12,4);
    ctx.fillStyle=def.color;
    ctx.fillRect(-2,-14,4,16);
    ctx.restore();
  } else {
    // Shield icon
    ctx.fillStyle=def.iconColor;
    ctx.beginPath();
    ctx.moveTo(cx,cy-13); ctx.lineTo(cx+10,cy-6); ctx.lineTo(cx+10,cy+4);
    ctx.lineTo(cx,cy+13); ctx.lineTo(cx-10,cy+4); ctx.lineTo(cx-10,cy-6);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle=def.color; ctx.lineWidth=2; ctx.stroke();
    ctx.fillStyle=def.color; ctx.fillRect(cx-1,cy-8,2,16); ctx.fillRect(cx-6,cy-1,12,2);
  }

  // Cooldown overlay
  if (cdFrac > 0) {
    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = '#000';
    // Draw clockwise from top
    ctx.beginPath();
    ctx.moveTo(cx,cy);
    const startA = -Math.PI/2;
    const endA   = startA + Math.PI*2*(1-cdFrac);
    ctx.arc(cx,cy,Math.min(w,h)/2-2, endA, startA, true);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // CD text
    pixelTextCenter(ctx,(cdFrac*(def.id===3?5:2)).toFixed(1)+'s',cx,cy+2,9,C.highlight);
  }

  // Skill number
  pixelText(ctx, def.id.toString(), x+3, y+2, 9, active ? C.highlight : C.textDim);

  // Active indicator
  if (active) {
    ctx.fillStyle=C.highlight;
    ctx.fillRect(x,y+h-3,w,3);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Collision helpers
// ─────────────────────────────────────────────────────────────────────────────
function isWallTile(map,r,c) {
  if(r<0||r>=MAP_ROWS||c<0||c>=MAP_COLS) return true;
  return map[r][c]===T_WALL;
}

function circleWallCollision(map,x,y,radius) {
  // Check surrounding tiles
  const r0=Math.floor((y-radius)/TILE), r1=Math.floor((y+radius)/TILE);
  const c0=Math.floor((x-radius)/TILE), c1=Math.floor((x+radius)/TILE);
  for(let r=r0;r<=r1;r++) for(let c=c0;c<=c1;c++) {
    if(!isWallTile(map,r,c)) continue;
    // Clamp circle centre to tile bounds
    const tx=c*TILE, ty=r*TILE;
    const nx=Math.max(tx,Math.min(x,tx+TILE));
    const ny=Math.max(ty,Math.min(y,ty+TILE));
    const dx=x-nx, dy=y-ny;
    if(dx*dx+dy*dy < radius*radius) return {tx,ty,nx,ny};
  }
  return null;
}

function resolveCircleWall(map,x,y,radius) {
  for(let iter=0;iter<4;iter++) {
    const hit=circleWallCollision(map,x,y,radius);
    if(!hit) break;
    const dx=x-hit.nx, dy=y-hit.ny;
    const d=Math.sqrt(dx*dx+dy*dy)||1;
    const push=radius-d+0.5;
    x+=dx/d*push; y+=dy/d*push;
  }
  return {x,y};
}

// ─────────────────────────────────────────────────────────────────────────────
// Button helper
// ─────────────────────────────────────────────────────────────────────────────
class Button {
  constructor(x,y,w,h,label,color,hoverColor) {
    this.x=x; this.y=y; this.w=w; this.h=h;
    this.label=label; this.color=color||'#2a2a4a'; this.hoverColor=hoverColor||'#3a3a6a';
    this.hovered=false;
  }
  contains(mx,my){ return mx>=this.x&&mx<=this.x+this.w&&my>=this.y&&my<=this.y+this.h; }
  draw(ctx) {
    const c = this.hovered ? this.hoverColor : this.color;
    drawRoundRect(ctx,this.x,this.y,this.w,this.h,6,c,2,C.uiBorder);
    if(this.hovered) {
      ctx.save(); ctx.globalAlpha=0.15;
      drawRoundRect(ctx,this.x,this.y,this.w,this.h,6,'#ffffff',0,'');
      ctx.restore();
    }
    pixelTextCenter(ctx,this.label,this.x+this.w/2,this.y+this.h/2,16,C.text);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Game class
// ─────────────────────────────────────────────────────────────────────────────
class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.W = canvas.width;
    this.H = canvas.height;

    this.audio  = new AudioSys();
    this.map    = buildMap();

    this.state  = S_LOBBY;
    this.lastT  = 0;

    // Skill ordering state
    this.skillOrder  = [0,1,2]; // indices into SKILL_DEFS
    this.dragSkill   = null;    // {index, offsetX, offsetY}
    this.dragMouseX  = 0;
    this.dragMouseY  = 0;

    // Mouse
    this.mouse = {x:0, y:0};

    // Playing state
    this.player     = null;
    this.monsters   = [];
    this.projectiles= [];
    this.meleeFx    = [];    // melee hit flashes
    this.damageNums = [];    // floating damage numbers

    // Lobby buttons (positioned in resize)
    this.btnStart   = new Button(0,0,200,50,'Start Game','#1a2a4a','#2a4a8a');
    this.btnHow     = new Button(0,0,200,50,'How to Play','#1a2a1a','#2a5a2a');
    this.btnBack    = new Button(0,0,120,40,'< Back','#2a1a1a','#5a2a2a');
    this.btnConfirm = new Button(0,0,180,48,'Confirm ▶','#1a3a1a','#2a6a2a');
    this.btnRestart = new Button(0,0,180,48,'Play Again','#1a2a4a','#2a4a8a');
    this.btnToLobby = new Button(0,0,180,48,'Main Menu','#2a1a1a','#5a2a2a');

    this.resize();
    this._bindEvents();
    requestAnimationFrame(t => this._loop(t));
  }

  resize() {
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.canvas.width  = this.W;
    this.canvas.height = this.H;

    // Reposition lobby buttons centred
    this.btnStart.x  = this.W/2-100; this.btnStart.y  = this.H/2+10;
    this.btnHow.x    = this.W/2-100; this.btnHow.y    = this.H/2+80;
    this.btnBack.x   = 20;            this.btnBack.y   = 20;
    this.btnConfirm.x= this.W/2-90;  this.btnConfirm.y= this.H-80;
    this.btnRestart.x= this.W/2-190; this.btnRestart.y= this.H/2+80;
    this.btnToLobby.x= this.W/2+10;  this.btnToLobby.y= this.H/2+80;
  }

  // ── Event binding ──────────────────────────────────────────────────────────
  _bindEvents() {
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', e => this._onKeyDown(e));
    window.addEventListener('keyup',   e => this._onKeyUp(e));
    this.canvas.addEventListener('mousemove',  e => this._onMouseMove(e));
    this.canvas.addEventListener('mousedown',  e => this._onMouseDown(e));
    this.canvas.addEventListener('mouseup',    e => this._onMouseUp(e));
    this.canvas.addEventListener('contextmenu',e => { e.preventDefault(); this._onRightClick(e); });
    this.canvas.addEventListener('click',      e => this._onClick(e));

    this.keys = {};
  }
  _onKeyDown(e) {
    this.keys[e.code] = true;
    if (this.state === S_PLAYING && e.code === 'Space') {
      // Space also usable, but spec says left click activates skill – keep for convenience
    }
  }
  _onKeyUp(e) { this.keys[e.code] = false; }
  _onMouseMove(e) {
    const r = this.canvas.getBoundingClientRect();
    this.mouse.x = e.clientX - r.left;
    this.mouse.y = e.clientY - r.top;
    // Update button hover
    for(const btn of [this.btnStart,this.btnHow,this.btnBack,this.btnConfirm,this.btnRestart,this.btnToLobby]) {
      btn.hovered = btn.contains(this.mouse.x,this.mouse.y);
    }
    if (this.state===S_SKILL_ORDER && this.dragSkill!==null) {
      this.dragMouseX = this.mouse.x;
      this.dragMouseY = this.mouse.y;
    }
  }
  _onMouseDown(e) {
    if(e.button!==0) return;
    const mx=this.mouse.x, my=this.mouse.y;
    if (this.state===S_SKILL_ORDER) {
      // Check if clicking a skill card to drag
      const slots = this._skillSlotRects();
      for(let i=0;i<3;i++) {
        const {x,y,w,h}=slots[i];
        if(mx>=x&&mx<=x+w&&my>=y&&my<=y+h) {
          this.dragSkill={ index:i };
          this.dragMouseX=mx; this.dragMouseY=my;
          return;
        }
      }
    }
    if (this.state===S_PLAYING) {
      this._activateSkill(mx,my);
    }
  }
  _onMouseUp(e) {
    if(e.button!==0) return;
    if(this.state===S_SKILL_ORDER && this.dragSkill!==null) {
      // Drop: find target slot
      const slots=this._skillSlotRects();
      const mx=this.dragMouseX, my=this.dragMouseY;
      for(let i=0;i<3;i++) {
        const {x,y,w,h}=slots[i];
        if(mx>=x&&mx<=x+w&&my>=y&&my<=y+h && i!==this.dragSkill.index) {
          // Swap
          const tmp=this.skillOrder[this.dragSkill.index];
          this.skillOrder[this.dragSkill.index]=this.skillOrder[i];
          this.skillOrder[i]=tmp;
          break;
        }
      }
      this.dragSkill=null;
    }
  }
  _onRightClick(e) {
    if(this.state===S_PLAYING && this.player) {
      this.player.cycleSkill();
    }
  }
  _onClick(e) {
    const mx=this.mouse.x, my=this.mouse.y;
    if(this.state===S_LOBBY) {
      if(this.btnStart.contains(mx,my)) this._startSkillOrder();
      if(this.btnHow.contains(mx,my))   this.state=S_HOW;
    } else if(this.state===S_HOW) {
      if(this.btnBack.contains(mx,my)) this.state=S_LOBBY;
    } else if(this.state===S_SKILL_ORDER) {
      if(this.btnBack.contains(mx,my))    this.state=S_LOBBY;
      if(this.btnConfirm.contains(mx,my)) this._startGame();
    } else if(this.state===S_WIN || this.state===S_DEAD) {
      if(this.btnRestart.contains(mx,my)) this._startSkillOrder();
      if(this.btnToLobby.contains(mx,my)) this.state=S_LOBBY;
    }
  }

  // ── Game init ─────────────────────────────────────────────────────────────
  _startSkillOrder() {
    this.skillOrder=[0,1,2];
    this.state=S_SKILL_ORDER;
  }

  _startGame() {
    // Spawn player near top-left open area
    this.player = new Player(5*TILE+TILE/2, 5*TILE+TILE/2);
    this.player.skillOrder = [...this.skillOrder];

    this.monsters=[];
    this.projectiles=[];
    this.meleeFx=[];
    this.damageNums=[];

    // Spawn initial monsters
    const spawnPoints = this._monsterSpawnPoints();
    for(let i=0;i<MAX_MONSTERS;i++) {
      const sp=spawnPoints[i%spawnPoints.length];
      this.monsters.push(new Monster(i,sp.x,sp.y));
    }

    this.state=S_PLAYING;
  }

  _monsterSpawnPoints() {
    // Various open areas on map, away from player start
    return [
      {x:38*TILE,y:8*TILE},{x:50*TILE,y:20*TILE},
      {x:20*TILE,y:40*TILE},{x:60*TILE,y:38*TILE},
      {x:35*TILE,y:48*TILE},{x:10*TILE,y:30*TILE},
      {x:45*TILE,y:50*TILE},{x:65*TILE,y:10*TILE},
    ];
  }

  // ── Skill activation ──────────────────────────────────────────────────────
  _activateSkill(mx,my) {
    const p=this.player;
    if(!p||p.hp<=0) return;
    const slotIdx = p.activeSkillSlot;
    const defIdx  = p.skillOrder[slotIdx];
    const def     = SKILL_DEFS[defIdx];
    const cd      = def.id===3 ? 5 : 2;

    if(p.cooldowns[defIdx]>0) return; // on cooldown

    const camX=this._camX(), camY=this._camY();
    const wx=mx+camX, wy=my+camY; // world coords
    const dx=wx-p.x, dy=wy-p.y;
    const dist=Math.sqrt(dx*dx+dy*dy)||1;

    if(def.id===1) {
      // Ranged
      const vx=(dx/dist)*PROJ_SPEED, vy=(dy/dist)*PROJ_SPEED;
      this.projectiles.push(new Projectile(p.x,p.y,vx,vy,1000,'player',6));
      p.cooldowns[defIdx]=cd;
      this.audio.shoot();
    } else if(def.id===2) {
      // Melee — arc hit
      const range=90;
      let hit=false;
      for(const m of this.monsters) {
        if(!m.alive) continue;
        const mdx=m.x-p.x, mdy=m.y-p.y;
        const md=Math.sqrt(mdx*mdx+mdy*mdy);
        if(md<=range) {
          // Check cone angle
          const dot=(mdx*dx+mdy*dy)/(md*dist);
          if(dot>0.2) { // roughly 78° cone
            const dmg=m.takeDamage(2000);
            this._spawnDamageNum(m.x,m.y,dmg,'#ff7043');
            this._checkMonsterDeath(m);
            hit=true;
          }
        }
      }
      // Melee FX
      this.meleeFx.push({x:p.x+dx/dist*50,y:p.y+dy/dist*50,angle:Math.atan2(dy,dx),t:0.3});
      p.cooldowns[defIdx]=cd;
      this.audio.melee();
    } else if(def.id===3) {
      // Shield toggle
      if(!p.shieldActive) {
        p.shieldActive=true;
        p.shieldTimer=3;
        this.audio.shieldOn();
      }
      p.cooldowns[defIdx]=5;
    }
  }

  _checkMonsterDeath(m) {
    if(!m.alive) {
      // Schedule respawn at spawn point
      const sp=this._monsterSpawnPoints();
      const pt=sp[m.id%sp.length];
      m.x=pt.x; m.y=pt.y;
      m.hp=MON_MAX_HP;
    }
  }

  _spawnDamageNum(x,y,dmg,color) {
    this.damageNums.push({x,y,dmg,color,t:1.2,vy:-50});
  }

  // ── Camera ────────────────────────────────────────────────────────────────
  _camX() {
    if(!this.player) return 0;
    return Math.max(0,Math.min(MAP_W-this.W, this.player.x-this.W/2));
  }
  _camY() {
    if(!this.player) return 0;
    return Math.max(0,Math.min(MAP_H-this.H, this.player.y-this.H/2));
  }

  // ── Skill order slot positions ────────────────────────────────────────────
  _skillSlotRects() {
    const slotW=120, slotH=140, gap=20;
    const totalW=3*slotW+2*gap;
    const sx=(this.W-totalW)/2;
    const sy=this.H/2-slotH/2-20;
    return [
      {x:sx,            y:sy,w:slotW,h:slotH},
      {x:sx+slotW+gap,  y:sy,w:slotW,h:slotH},
      {x:sx+2*(slotW+gap),y:sy,w:slotW,h:slotH},
    ];
  }

  // ── Main loop ─────────────────────────────────────────────────────────────
  _loop(ts) {
    const dt=Math.min((ts-this.lastT)/1000, 0.05);
    this.lastT=ts;
    const ctx=this.ctx;

    ctx.fillStyle=C.bg; ctx.fillRect(0,0,this.W,this.H);

    switch(this.state) {
      case S_LOBBY:       this._drawLobby(ctx); break;
      case S_HOW:         this._drawHowToPlay(ctx); break;
      case S_SKILL_ORDER: this._drawSkillOrder(ctx); break;
      case S_PLAYING:     this._updateGame(dt); this._drawGame(ctx); break;
      case S_WIN:         this._drawGame(ctx); this._drawWin(ctx); break;
      case S_DEAD:        this._drawGame(ctx); this._drawDead(ctx); break;
    }

    requestAnimationFrame(t => this._loop(t));
  }

  // ── Update ────────────────────────────────────────────────────────────────
  _updateGame(dt) {
    const p=this.player;
    if(!p) return;

    // Player movement
    let vx=0, vy=0;
    if(this.keys['KeyW']||this.keys['ArrowUp'])    vy=-1;
    if(this.keys['KeyS']||this.keys['ArrowDown'])  vy= 1;
    if(this.keys['KeyA']||this.keys['ArrowLeft'])  vx=-1;
    if(this.keys['KeyD']||this.keys['ArrowRight']) vx= 1;
    if(vx&&vy) { vx*=0.707; vy*=0.707; }

    let nx=p.x+vx*PLAYER_SPEED*dt;
    let ny=p.y+vy*PLAYER_SPEED*dt;
    // Clamp to map
    nx=Math.max(p.r,Math.min(MAP_W-p.r,nx));
    ny=Math.max(p.r,Math.min(MAP_H-p.r,ny));
    const resolved=resolveCircleWall(this.map,nx,ny,p.r);
    p.x=resolved.x; p.y=resolved.y;

    p.update(dt);

    // Check destination
    const pc=Math.floor(p.x/TILE), pr=Math.floor(p.y/TILE);
    if(this.map[pr]&&this.map[pr][pc]===T_DEST) {
      this.state=S_WIN;
      this.audio.win();
      return;
    }

    // Monsters
    for(const m of this.monsters) {
      m.update(dt);
      if(!m.alive) {
        if(m.respawnTimer<=0) {
          m.alive=true; m.hp=MON_MAX_HP;
        }
        continue;
      }
      // Chase player
      this._moveMonster(m,p,dt);
      // Ranged attack
      if(m.rangedCd<=0) {
        const dx=p.x-m.x, dy=p.y-m.y;
        const d=Math.sqrt(dx*dx+dy*dy);
        if(d<450&&d>60) {
          const vx=(dx/d)*MON_PROJ_SPEED, vy=(dy/d)*MON_PROJ_SPEED;
          this.projectiles.push(new Projectile(m.x,m.y,vx,vy,500,'monster',7));
          m.rangedCd=3;
          this.audio.monShoot();
        }
      }
      // Collision damage
      const pdx=p.x-m.x, pdy=p.y-m.y;
      const pdist=Math.sqrt(pdx*pdx+pdy*pdy);
      if(pdist < p.r+m.r && m.collisionCd<=0) {
        const dmg=p.takeDamage(3000);
        if(dmg>0) {
          this._spawnDamageNum(p.x,p.y-30,dmg,'#ff4444');
          this.audio.hit();
        }
        m.collisionCd=3;
      }
    }

    // Projectiles
    for(const proj of this.projectiles) {
      proj.update(dt,this.map);
      if(!proj.alive) continue;
      if(proj.owner==='player') {
        for(const m of this.monsters) {
          if(!m.alive) continue;
          const dx=proj.x-m.x, dy=proj.y-m.y;
          if(dx*dx+dy*dy<(proj.r+m.r)**2) {
            const dmg=m.takeDamage(proj.dmg);
            this._spawnDamageNum(m.x,m.y,dmg,'#00e5ff');
            this._checkMonsterDeath(m);
            proj.alive=false; break;
          }
        }
      } else {
        const dx=proj.x-p.x, dy=proj.y-p.y;
        if(dx*dx+dy*dy<(proj.r+p.r)**2) {
          const dmg=p.takeDamage(proj.dmg);
          if(dmg>0) {
            this._spawnDamageNum(p.x,p.y-30,dmg,'#ff4444');
            this.audio.hit();
          }
          proj.alive=false;
        }
      }
    }
    this.projectiles=this.projectiles.filter(pr=>pr.alive);

    // Melee FX
    for(const fx of this.meleeFx) fx.t-=dt;
    this.meleeFx=this.meleeFx.filter(fx=>fx.t>0);

    // Damage numbers
    for(const dn of this.damageNums) { dn.t-=dt; dn.y+=dn.vy*dt; }
    this.damageNums=this.damageNums.filter(dn=>dn.t>0);

    // Player death
    if(p.hp<=0) { this.state=S_DEAD; this.audio.die(); }
  }

  _moveMonster(m,p,dt) {
    const dx=p.x-m.x, dy=p.y-m.y;
    const d=Math.sqrt(dx*dx+dy*dy)||1;
    let nx=m.x+(dx/d)*m.speed*dt;
    let ny=m.y+(dy/d)*m.speed*dt;
    nx=Math.max(m.r,Math.min(MAP_W-m.r,nx));
    ny=Math.max(m.r,Math.min(MAP_H-m.r,ny));
    const res=resolveCircleWall(this.map,nx,ny,m.r);
    // Simple slide: if blocked, try axes separately
    if(res.x===m.x&&res.y===m.y) {
      const rx=resolveCircleWall(this.map,m.x+(dx/d)*m.speed*dt,m.y,m.r);
      const ry=resolveCircleWall(this.map,m.x,m.y+(dy/d)*m.speed*dt,m.r);
      if(Math.abs(rx.x-m.x)>0.1) { m.x=rx.x; return; }
      if(Math.abs(ry.y-m.y)>0.1) { m.y=ry.y; return; }
    }
    m.x=res.x; m.y=res.y;
  }

  // ── Drawing ───────────────────────────────────────────────────────────────
  _drawLobby(ctx) {
    const W=this.W, H=this.H;
    // Background pattern
    ctx.fillStyle='#0d0d1a'; ctx.fillRect(0,0,W,H);
    // Grid bg
    ctx.strokeStyle='rgba(50,50,100,0.25)'; ctx.lineWidth=1;
    for(let x=0;x<W;x+=32) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
    for(let y=0;y<H;y+=32) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

    // Title
    ctx.save();
    ctx.shadowColor='#4488ff'; ctx.shadowBlur=20;
    pixelTextCenter(ctx,'PIXEL DUNGEON',W/2,H/2-120,52,C.highlight);
    ctx.restore();
    ctx.save();
    ctx.shadowColor='#ff4400'; ctx.shadowBlur=12;
    pixelTextCenter(ctx,'打怪遊戲',W/2,H/2-55,28,'#ff8844');
    ctx.restore();

    // Buttons
    this.btnStart.draw(ctx);
    this.btnHow.draw(ctx);

    // Footer
    pixelTextCenter(ctx,'WASD to move  |  Right-click to cycle skill  |  Left-click to use skill',
      W/2,H-24,11,C.textDim);
  }

  _drawHowToPlay(ctx) {
    const W=this.W, H=this.H;
    ctx.fillStyle='#0d0d1a'; ctx.fillRect(0,0,W,H);
    drawRoundRect(ctx,W/2-340,40,680,H-80,12,'rgba(10,10,30,0.95)',2,C.uiBorder);

    pixelTextCenter(ctx,'HOW TO PLAY',W/2,70,26,C.highlight);

    const lines=[
      ['CONTROLS',''],
      ['','Move:  WASD / Arrow Keys'],
      ['','Cycle Skill:  Right Mouse Button'],
      ['','Use Skill:  Left Mouse Button'],
      ['','',''],
      ['SKILLS',''],
      ['','1. Ranged Attack  —  Shoot bullet toward cursor   DMG:1000  CD:2s'],
      ['','2. Melee Attack   —  Slash enemies in front        DMG:2000  CD:2s'],
      ['','3. Shield         —  50% damage reduction for 3s             CD:5s'],
      ['','',''],
      ['OBJECTIVE',''],
      ['','Reach the destination tile (★) at the map edge to WIN.'],
      ['','Survive monsters — they respawn 5s after death.'],
      ['','You do NOT need to kill all monsters.'],
      ['','',''],
      ['SKILL ORDER PAGE',''],
      ['','Drag skills to reorder before each game.'],
      ['','The active skill is highlighted gold. Right-click cycles through.'],
      ['','',''],
      ['MONSTERS',''],
      ['','Each monster has 5000 HP.'],
      ['','Collision damage: 3000 (3s cooldown).'],
      ['','Ranged attack:    500  (3s cooldown).'],
      ['','',''],
      ['PLAYER',''],
      ['','Starting HP: 10000.'],
      ['','Shield reduces incoming damage by 50%.'],
    ];
    let y=110;
    for(const [head,body] of lines) {
      if(head) {
        pixelText(ctx,'▸ '+head,W/2-310,y,14,C.highlight,'left');
        y+=22;
      } else if(body) {
        pixelText(ctx,body,W/2-295,y,12,C.text,'left');
        y+=18;
      } else {
        y+=6;
      }
      if(y>H-80) break;
    }

    this.btnBack.draw(ctx);
  }

  _drawSkillOrder(ctx) {
    const W=this.W, H=this.H;
    ctx.fillStyle='#0d0d1a'; ctx.fillRect(0,0,W,H);

    // Background decoration
    ctx.strokeStyle='rgba(50,50,100,0.2)'; ctx.lineWidth=1;
    for(let x=0;x<W;x+=48) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
    for(let y=0;y<H;y+=48) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

    pixelTextCenter(ctx,'SKILL ORDER',W/2,H/2-210,32,C.highlight);
    pixelTextCenter(ctx,'Drag skills to set your preferred order',W/2,H/2-168,14,C.textDim);

    const slots=this._skillSlotRects();
    const draggingIdx = this.dragSkill ? this.dragSkill.index : -1;

    for(let i=0;i<3;i++) {
      if(i===draggingIdx) continue; // draw dragged item last
      const {x,y,w,h}=slots[i];
      const def=SKILL_DEFS[this.skillOrder[i]];
      this._drawSkillCard(ctx,x,y,w,h,def,i===0,false);
      // Slot number label
      pixelTextCenter(ctx,'Slot '+(i+1),x+w/2,y+h+14,11,C.textDim);
    }
    // Arrows between slots
    for(let i=0;i<2;i++) {
      const {x,y,w,h}=slots[i];
      pixelTextCenter(ctx,'⇄',x+w+16,y+h/2,22,'#666688');
    }

    // Draw dragged card on top
    if(this.dragSkill!==null) {
      const i=this.dragSkill.index;
      const {w,h}=slots[i];
      const def=SKILL_DEFS[this.skillOrder[i]];
      this._drawSkillCard(ctx,this.dragMouseX-w/2,this.dragMouseY-h/2,w,h,def,i===0,true);
    }

    // Active slot legend
    pixelTextCenter(ctx,'★ Slot 1 is initially active when game starts',W/2,H/2+110,12,'#aaaacc');

    this.btnBack.draw(ctx);
    this.btnConfirm.draw(ctx);
  }

  _drawSkillCard(ctx,x,y,w,h,def,first,dragging) {
    ctx.save();
    if(dragging) { ctx.globalAlpha=0.85; ctx.shadowColor=def.color; ctx.shadowBlur=16; }
    // Card bg
    const bg = first ? 'rgba(40,35,0,0.95)' : 'rgba(15,15,30,0.95)';
    drawRoundRect(ctx,x,y,w,h,8,bg,dragging?3:2,dragging?def.color:C.uiBorder);
    if(first && !dragging) {
      ctx.strokeStyle=C.highlight; ctx.lineWidth=2;
      ctx.beginPath(); ctx.roundRect(x,y,w,h,8); ctx.stroke();
    }
    // Icon area
    const iS=60;
    ctx.save();
    ctx.beginPath(); ctx.roundRect(x+w/2-iS/2,y+10,iS,iS,6); ctx.clip();
    ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(x+w/2-iS/2,y+10,iS,iS);
    ctx.restore();
    drawSkillIcon(ctx,x+w/2-iS/2,y+10,iS,iS,def,false,0);
    // Name
    pixelTextCenter(ctx,def.name,x+w/2,y+80,12,def.color);
    // Description
    const descLines=def.desc.split('\n');
    for(let i=0;i<descLines.length;i++) {
      pixelTextCenter(ctx,descLines[i],x+w/2,y+98+i*15,10,'#aaaacc');
    }
    ctx.restore();
  }

  _drawGame(ctx) {
    const camX=this._camX(), camY=this._camY();
    // Draw map
    drawMap(ctx,this.map,camX,camY,this.W,this.H);

    if(!this.player) return;
    const p=this.player;

    ctx.save();
    ctx.translate(-camX,-camY);

    // Melee FX
    for(const fx of this.meleeFx) {
      const a=fx.t/0.3;
      ctx.save();
      ctx.globalAlpha=a*0.7;
      ctx.strokeStyle='#ff7043'; ctx.lineWidth=3;
      ctx.translate(fx.x,fx.y); ctx.rotate(fx.angle);
      ctx.beginPath();
      for(let i=-3;i<=3;i++) {
        ctx.moveTo(-30,i*5); ctx.lineTo(30,i*5);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Monster projectiles & player projectiles
    for(const proj of this.projectiles) {
      ctx.fillStyle = proj.owner==='player' ? C.bullet : C.monBullet;
      ctx.save();
      ctx.shadowColor=ctx.fillStyle; ctx.shadowBlur=8;
      ctx.beginPath(); ctx.arc(proj.x,proj.y,proj.r,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }

    // Monsters
    for(const m of this.monsters) {
      if(m.alive) drawMonster(ctx,m);
    }

    // Player
    drawPlayer(ctx,p.x,p.y,p);

    // Damage numbers
    for(const dn of this.damageNums) {
      ctx.save();
      ctx.globalAlpha=Math.min(1,dn.t/0.5);
      ctx.font=`bold ${10+Math.floor(dn.dmg/500)}px "Courier New",monospace`;
      ctx.fillStyle=dn.color;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('-'+dn.dmg,dn.x,dn.y);
      ctx.restore();
    }

    ctx.restore(); // end camera transform

    // HUD
    this._drawHUD(ctx, p);
  }

  _drawHUD(ctx, p) {
    const W=this.W, H=this.H;

    // ── Player HP bar (top-left) ──────────────────────────────────────────
    const hpBarW=240, hpBarH=18;
    const hpX=16, hpY=16;
    ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fillRect(hpX-4,hpY-4,hpBarW+8,hpBarH+30);
    ctx.strokeStyle=C.uiBorder; ctx.lineWidth=1; ctx.strokeRect(hpX-4,hpY-4,hpBarW+8,hpBarH+30);
    pixelText(ctx,'HP',hpX,hpY,11,C.textDim);
    ctx.fillStyle='#111'; ctx.fillRect(hpX+22,hpY,hpBarW-22,hpBarH);
    const hpPct=p.hp/p.maxHp;
    const hpCol=hpPct>0.5?C.hpGreen:hpPct>0.25?C.hpYellow:C.hpRed;
    ctx.fillStyle=hpCol; ctx.fillRect(hpX+22,hpY,Math.floor((hpBarW-22)*hpPct),hpBarH);
    ctx.strokeStyle='#000'; ctx.lineWidth=1; ctx.strokeRect(hpX+22,hpY,hpBarW-22,hpBarH);
    pixelText(ctx,p.hp+' / '+p.maxHp,hpX+26,hpY+1,10,C.text);
    if(p.shieldActive) {
      const pulse=0.7+0.3*Math.sin(Date.now()*0.01);
      ctx.save(); ctx.globalAlpha=pulse;
      pixelText(ctx,'🛡 SHIELD '+(p.shieldTimer>0?p.shieldTimer.toFixed(1)+'s':''),hpX,hpY+20,11,C.shieldBorder);
      ctx.restore();
    }

    // ── Skill bar (bottom-right) ──────────────────────────────────────────
    const slotW=70, slotH=70, slotGap=6;
    const sbX=W-(slotW*3+slotGap*2+16);
    const sbY=H-slotH-16;

    // Background panel
    ctx.fillStyle='rgba(0,0,0,0.75)';
    ctx.fillRect(sbX-8,sbY-8,slotW*3+slotGap*2+16,slotH+16);
    ctx.strokeStyle=C.uiBorder; ctx.lineWidth=1;
    ctx.strokeRect(sbX-8,sbY-8,slotW*3+slotGap*2+16,slotH+16);

    for(let i=0;i<3;i++) {
      const sx=sbX+i*(slotW+slotGap);
      const defIdx=p.skillOrder[i];
      const def=SKILL_DEFS[defIdx];
      const isActive=(i===p.activeSkillSlot);
      const cd=p.cooldowns[defIdx];
      const maxCd=def.id===3?5:2;
      const cdFrac=cd/maxCd;
      drawSkillIcon(ctx,sx,sbY,slotW,slotH,def,isActive,cdFrac);
    }

    // Minimap hint (top-right)
    const mmX=W-120, mmY=16;
    ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(mmX,mmY,104,58);
    ctx.strokeStyle=C.uiBorder; ctx.lineWidth=1; ctx.strokeRect(mmX,mmY,104,58);
    pixelText(ctx,'★ Reach golden tiles',mmX+4,mmY+4,9,C.destHigh);
    pixelText(ctx,'  on map edge to WIN',mmX+4,mmY+18,9,C.textDim);
    pixelText(ctx,'Right edge, mid-map',mmX+4,mmY+32,9,C.textDim);
    pixelText(ctx,'Right-click: cycle skill',mmX+4,mmY+44,9,'#8888cc');
  }

  _drawWin(ctx) {
    const W=this.W, H=this.H;
    ctx.save(); ctx.globalAlpha=0.7;
    ctx.fillStyle='#000'; ctx.fillRect(0,0,W,H);
    ctx.restore();
    drawRoundRect(ctx,W/2-220,H/2-140,440,280,16,'rgba(10,30,10,0.98)',3,'#00cc44');
    ctx.save(); ctx.shadowColor='#00ff44'; ctx.shadowBlur=30;
    pixelTextCenter(ctx,'YOU WIN!',W/2,H/2-90,48,C.hpGreen);
    ctx.restore();
    pixelTextCenter(ctx,'You reached the destination!',W/2,H/2-30,16,C.text);
    pixelTextCenter(ctx,'Remaining HP: '+this.player.hp,W/2,H/2+5,14,C.hpYellow);
    this.btnRestart.draw(ctx); this.btnToLobby.draw(ctx);
  }

  _drawDead(ctx) {
    const W=this.W, H=this.H;
    ctx.save(); ctx.globalAlpha=0.72;
    ctx.fillStyle='#1a0000'; ctx.fillRect(0,0,W,H);
    ctx.restore();
    drawRoundRect(ctx,W/2-220,H/2-140,440,280,16,'rgba(30,5,5,0.98)',3,'#cc2200');
    ctx.save(); ctx.shadowColor='#ff2200'; ctx.shadowBlur=30;
    pixelTextCenter(ctx,'YOU DIED',W/2,H/2-90,48,C.hpRed);
    ctx.restore();
    pixelTextCenter(ctx,'Slain by the dungeon monsters...',W/2,H/2-30,15,C.text);
    this.btnRestart.draw(ctx); this.btnToLobby.draw(ctx);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────
window.addEventListener('load', () => {
  const canvas = document.getElementById('gameCanvas');
  window._game = new Game(canvas);
});
