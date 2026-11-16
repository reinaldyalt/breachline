// BREACHLINE — the DOM HUD. It never touches the simulation; main.js pushes numbers
// in and reads callbacks out. Includes a live top-down minimap (walls, sites, dots for
// the player, allies and spotted enemies) drawn on a small canvas each frame.
import { WEAPONS } from './weapon.js';

export function createHud(worldBoxes) {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const ammoBox = $('ammo');
  const healthFill = $('health-fill');
  const healthNum = $('health-num');
  const moneyEl = $('money');
  const timerEl = $('timer');
  const scoreUs = $('score-us');
  const scoreThem = $('score-them');
  const roundEl = $('round-label');
  const feedEl = $('killfeed');
  const promptEl = $('prompt');
  const bombEl = $('bomb-status');
  const weaponEl = $('weapon-name');
  const grenadeEl = $('grenade-count');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const vignette = $('damage-vignette');
  const buyMenu = $('buy-menu');
  const buyList = $('buy-list');
  const minimap = $('minimap');
  const mctx = minimap.getContext('2d');
  let hitTimer = 0;
  let last = {};

  function setText(el, key, value) {
    if (last[key] !== value) {
      last[key] = value;
      el.textContent = value;
    }
  }

  function fmtTime(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  return {
    setHealth(hp) {
      setText(healthNum, 'hp', String(Math.max(0, Math.round(hp))));
      const pct = Math.max(0, Math.min(100, hp));
      if (last.hpp !== pct) {
        last.hpp = pct;
        healthFill.style.width = `${pct}%`;
        healthFill.classList.toggle('low', pct <= 30);
      }
    },
    setAmmo(mag, reserve) {
      setText(ammoMag, 'mag', String(mag));
      setText(ammoReserve, 'res', `/ ${reserve}`);
      ammoBox.classList.toggle('empty', mag === 0);
    },
    setWeapon(name, grenades) {
      setText(weaponEl, 'wpn', name);
      setText(grenadeEl, 'grn', grenades > 0 ? `G x${grenades}` : '');
    },
    setMoney(value) { setText(moneyEl, 'money', `$${value}`); },
    setTimer(seconds, urgent) {
      setText(timerEl, 'timer', fmtTime(seconds));
      timerEl.classList.toggle('urgent', !!urgent);
    },
    setScore(us, them) {
      setText(scoreUs, 'su', String(us));
      setText(scoreThem, 'st', String(them));
    },
    setRound(n, max) { setText(roundEl, 'round', `ROUND ${n}/${max}`); },
    setBomb(text, kind) {
      setText(bombEl, 'bomb', text);
      bombEl.className = kind || '';
    },
    setPrompt(text) { setText(promptEl, 'prompt', text); },
    setSpread(px) {
      crosshair.style.setProperty('--gap', `${px}px`);
    },
    hitMarker(killed, holdMs = 120) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', !!killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      vignette.classList.add('on');
      setTimeout(() => vignette.classList.remove('on'), 220);
    },
    setFeed(lines) {
      const text = lines.join('\n');
      if (last.feed !== text) {
        last.feed = text;
        feedEl.textContent = text;
      }
    },
    showOverlay(mode, data) {
      const map = {
        start: ['BREACHLINE', 'Round-based tactical FPS. Plant the charge at site A or B, or eliminate the Sentinel squad. Click to play.', 'Click to play'],
        paused: ['BREACHLINE', 'Paused. Click to resume.', 'Click to resume'],
        roundEnd: [data.title, data.copy, 'Next round'],
        matchEnd: [data.title, data.copy, 'Play again'],
      };
      const [t, c, a] = map[mode];
      title.textContent = t;
      copy.textContent = c;
      play.textContent = a;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() { overlay.hidden = true; },
    onPlay(handler) { play.addEventListener('click', handler); },
    // Buy menu: rows built once from the weapon table; main.js wires the buttons.
    buildBuy(onBuy) {
      buyList.innerHTML = '';
      const rows = [
        ...Object.values(WEAPONS).filter((w) => w.price > 0).map((w) => ({
          id: w.id, name: w.name, price: w.price, desc: `${w.damage} dmg · ${w.mag} rnd mag`,
        })),
        { id: 'grenade', name: 'Frag Grenade', price: 300, desc: 'Thrown explosive · 7 m blast' },
      ];
      for (const row of rows) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'buy-row';
        btn.dataset.id = row.id;
        btn.innerHTML = `<span class="buy-name">${row.name}</span><span class="buy-desc">${row.desc}</span><span class="buy-price">$${row.price}</span>`;
        btn.addEventListener('click', () => onBuy(row.id));
        buyList.appendChild(btn);
      }
    },
    showBuy(show) { buyMenu.hidden = !show; },
    markOwned(id, owned) {
      for (const btn of buyList.children) {
        btn.classList.toggle('owned', owned.includes(btn.dataset.id));
      }
    },
    drawMinimap(playerPos, playerYaw, allies, enemies, bombSite) {
      const W = minimap.width;
      const H = minimap.height;
      const sx = (x) => ((x + 21) / 42) * W;
      const sz = (z) => ((z + 15) / 30) * H;
      mctx.clearRect(0, 0, W, H);
      mctx.fillStyle = 'rgba(20,18,14,0.85)';
      mctx.fillRect(0, 0, W, H);
      // Site pads.
      for (const [key, c] of [['A', '#f0a830'], ['B', '#35c4a8']]) {
        const s = key === 'A'
          ? { x: -19, z: -13.5, w: 12, h: 8.5 }
          : { x: 7, z: 5, w: 12, h: 8.5 };
        mctx.fillStyle = bombSite === key ? c : `${c}55`;
        mctx.fillRect(sx(s.x), sz(s.z), (s.w / 42) * W, (s.h / 30) * H);
        mctx.fillStyle = '#14161a';
        mctx.font = 'bold 11px sans-serif';
        mctx.fillText(key, sx(s.x) + 4, sz(s.z) + 13);
      }
      // Walls / cover.
      mctx.fillStyle = '#6a6255';
      for (const b of worldBoxes) {
        mctx.fillRect(sx(b.minX), sz(b.minZ), ((b.maxX - b.minX) / 42) * W, ((b.maxZ - b.minZ) / 30) * H);
      }
      const dot = (x, z, color, r) => {
        mctx.fillStyle = color;
        mctx.beginPath();
        mctx.arc(sx(x), sz(z), r, 0, Math.PI * 2);
        mctx.fill();
      };
      for (const e of enemies) if (e.alive) dot(e.pos.x, e.pos.z, '#e5484d', 3);
      for (const a of allies) if (a.alive) dot(a.pos.x, a.pos.z, '#35c4a8', 3);
      // Player arrow.
      mctx.save();
      mctx.translate(sx(playerPos.x), sz(playerPos.z));
      mctx.rotate(Math.atan2(-Math.sin(playerYaw), -Math.cos(playerYaw)) + Math.PI);
      mctx.fillStyle = '#f2ead9';
      mctx.beginPath();
      mctx.moveTo(0, -6);
      mctx.lineTo(4, 5);
      mctx.lineTo(-4, 5);
      mctx.closePath();
      mctx.fill();
      mctx.restore();
    },
  };
}
