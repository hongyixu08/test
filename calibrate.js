/* =========================================================================
 * calibrate.js —— 座位打点标定工具（研究者用）
 * 入口：index.html#calibrate 或首页“座位打点标定工具”按钮。
 * 用法：先选“当前座位”，再在楼层图上按住拖拽框出该区域；
 *       拖动已有方框可移动；重新框选同一座位可覆盖（调整大小）。
 * 数据保存在浏览器 localStorage（键名见 config.js 的 HOTSPOT_KEY），
 * 也可导出 JSON 作为备份。
 * ========================================================================= */

(function () {
  'use strict';

  if (typeof SEATS === 'undefined' || typeof FLOORS === 'undefined') return;

  const $ = (id) => document.getElementById(id);
  let calFloor = '3';
  let activeSeatId = null;
  let draft = null; // 绘制中的临时框 {startX,startY,el}

  function isCal() { return location.hash === '#calibrate'; }

  /* ---------- 坐标换算 ---------- */
  function pos(e, el) {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function norm(rectPx, el) {
    return {
      x: clamp(rectPx.x / el.clientWidth * 100),
      y: clamp(rectPx.y / el.clientHeight * 100),
      w: clamp(rectPx.w / el.clientWidth * 100),
      h: clamp(rectPx.h / el.clientHeight * 100),
    };
  }

  function clamp(n) { return Math.min(100, Math.max(0, n)); }

  /* ---------- 构建界面 ---------- */
  function show() {
    document.querySelectorAll('.screen').forEach((el) => el.classList.add('hidden'));
    const screen = $('screen-calibrate');
    screen.classList.remove('hidden');
    buildUI(screen);
    renderCal();
  }

  function buildUI(screen) {
    if (screen.dataset.built) return;
    screen.dataset.built = '1';
    screen.innerHTML = `
      <div class="card">
        <h1>🧭 座位打点标定工具（研究者）</h1>
        <p class="muted">为每个座位在楼层图上框出位置。标定结果实时保存到本浏览器，可直接用于实验；也可导出 JSON 备份。</p>
        <div class="cal-toolbar">
          <select id="cal-floor"></select>
          <select id="cal-seat"></select>
          <button class="btn btn-ghost btn-sm" id="cal-del">✕ 删除当前座位框</button>
          <button class="btn btn-ghost btn-sm" id="cal-clear-floor">清空本楼层</button>
          <button class="btn btn-ghost btn-sm" id="cal-clear-all">清空全部标定</button>
          <button class="btn btn-primary btn-sm" id="cal-export">⬇ 导出标定 JSON</button>
          <a class="btn btn-ghost btn-sm" id="cal-back" href="#">← 返回实验</a>
        </div>
      </div>
      <div class="card">
        <div class="cal-hint" style="margin-bottom:12px">
          👆 先在“当前座位”选中要标定的座位，然后<b>在图上按住拖拽</b>框出该区域。
          拖动已有蓝色方框可移动位置；<b>重新框选同一座位</b>可覆盖并调整大小。
        </div>
        <div class="map-scroll" style="max-height:600px">
          <div class="cal-canvas-wrap" id="cal-wrap">
            <img id="cal-img" alt="楼层平面图">
            <div class="cal-overlay" id="cal-overlay"></div>
          </div>
        </div>
      </div>`;

    const floorSel = $('cal-floor');
    floorSel.innerHTML = FLOORS.map((f) => `<option value="${f.id}">${f.name}</option>`).join('');
    floorSel.value = calFloor;
    floorSel.addEventListener('change', () => { calFloor = floorSel.value; activeSeatId = null; renderCal(); });

    $('cal-seat').addEventListener('change', (e) => {
      activeSeatId = e.target.value || null;
      refreshSeatHighlight();
    });

    $('cal-del').addEventListener('click', () => {
      if (!activeSeatId) { alert('请先在“当前座位”选中要删除的座位。'); return; }
      const map = loadHotspots();
      delete map[activeSeatId];
      saveHotspots(map);
      renderRects();
    });

    $('cal-clear-floor').addEventListener('click', () => {
      if (!confirm('确认清空本楼层的所有标定？')) return;
      const map = loadHotspots();
      SEATS.filter((s) => s.floor === calFloor).forEach((s) => delete map[s.id]);
      saveHotspots(map);
      renderRects();
    });

    $('cal-clear-all').addEventListener('click', () => {
      if (!confirm('确认清空全部楼层的所有标定？')) return;
      saveHotspots({});
      renderRects();
    });

    $('cal-export').addEventListener('click', exportJSON);
    $('cal-back').addEventListener('click', () => {
      location.hash = '';
      location.reload();
    });

    // 绘制事件只绑定一次（overlay 在 buildUI 中创建一次，切楼层不会重建）
    bindDraw($('cal-overlay'));
  }

  function renderCal() {
    const floor = FLOORS.find((f) => f.id === calFloor);
    const seats = SEATS.filter((s) => s.floor === calFloor);
    const img = $('cal-img');
    img.src = floor.image;

    const seatSel = $('cal-seat');
    seatSel.innerHTML = `<option value="">—— 选择要标定的座位 ——</option>` +
      seats.map((s) => `<option value="${s.id}" ${s.id === activeSeatId ? 'selected' : ''}>${s.name}</option>`).join('');
    if (!seats.some((s) => s.id === activeSeatId)) activeSeatId = null;

    const overlay = $('cal-overlay');
    overlay.innerHTML = '';
    draft = null;
    renderRects();
  }

  function refreshSeatHighlight() {
    document.querySelectorAll('.cal-rect').forEach((el) => {
      el.classList.toggle('active', el.dataset.seat === activeSeatId);
    });
  }

  function renderRects() {
    const overlay = $('cal-overlay');
    if (!overlay) return;
    overlay.querySelectorAll('.cal-rect').forEach((r) => r.remove());

    const img = $('cal-img');
    if (!img.complete || !img.naturalWidth) {
      img.onload = renderRects;
      return;
    }
    const w = overlay.clientWidth;
    const h = overlay.clientHeight;
    if (!w || !h) { setTimeout(renderRects, 50); return; }

    SEATS.filter((s) => s.floor === calFloor).forEach((s) => {
      const hp = hotspotOf(s.id);
      if (!hp) return;
      const el = document.createElement('div');
      el.className = 'cal-rect';
      el.dataset.seat = s.id;
      el.style.left = (hp.x / 100 * w) + 'px';
      el.style.top = (hp.y / 100 * h) + 'px';
      el.style.width = (hp.w / 100 * w) + 'px';
      el.style.height = (hp.h / 100 * h) + 'px';
      el.innerHTML = `<span class="lbl">${s.name}</span><span class="del">✕</span>`;
      el.querySelector('.del').addEventListener('mousedown', (e) => e.stopPropagation());
      el.querySelector('.del').addEventListener('click', (e) => {
        e.stopPropagation();
        const map = loadHotspots();
        delete map[s.id];
        saveHotspots(map);
        renderRects();
      });
      el.addEventListener('mousedown', (e) => { if (e.button === 0) startMove(e, s.id, el); });
      overlay.appendChild(el);
    });
    refreshSeatHighlight();
  }

  /* ---------- 绘制（在空白处拖拽框选） ---------- */
  function bindDraw(overlay) {
    overlay.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || e.target !== overlay) return;
      if (!activeSeatId) { alert('请先在“当前座位”下拉框选择要标定的座位。'); return; }
      const p = pos(e, overlay);
      draft = { startX: p.x, startY: p.y };
      const el = document.createElement('div');
      el.className = 'cal-rect';
      el.style.left = p.x + 'px';
      el.style.top = p.y + 'px';
      el.style.width = '0px';
      el.style.height = '0px';
      overlay.appendChild(el);
      draft.el = el;
      e.preventDefault();
    });

    overlay.addEventListener('mousemove', (e) => {
      if (!draft) return;
      const p = pos(e, overlay);
      const x = Math.min(p.x, draft.startX);
      const y = Math.min(p.y, draft.startY);
      const w = Math.abs(p.x - draft.startX);
      const h = Math.abs(p.y - draft.startY);
      draft.el.style.left = x + 'px';
      draft.el.style.top = y + 'px';
      draft.el.style.width = w + 'px';
      draft.el.style.height = h + 'px';
    });

    overlay.addEventListener('mouseup', (e) => {
      if (!draft) return;
      const overlayEl = overlay;
      const rectPx = {
        x: parseFloat(draft.el.style.left),
        y: parseFloat(draft.el.style.top),
        w: parseFloat(draft.el.style.width),
        h: parseFloat(draft.el.style.height),
      };
      const map = loadHotspots();
      map[activeSeatId] = norm(rectPx, overlayEl);
      saveHotspots(map);
      draft.el.remove();
      draft = null;
      renderRects();
    });

    overlay.addEventListener('mouseleave', () => {
      if (draft && draft.el) { draft.el.remove(); draft = null; }
    });
  }

  /* ---------- 拖动已有方框移动 ---------- */
  function startMove(e, seatId, el) {
    activeSeatId = seatId;
    const seatSel = $('cal-seat');
    if (seatSel) seatSel.value = seatId;
    refreshSeatHighlight();

    const overlay = $('cal-overlay');
    const start = pos(e, overlay);
    const orig = {
      x: parseFloat(el.style.left),
      y: parseFloat(el.style.top),
      w: parseFloat(el.style.width),
      h: parseFloat(el.style.height),
    };

    function onMove(ev) {
      const p = pos(ev, overlay);
      const nx = clampPx(orig.x + (p.x - start.x), overlay.clientWidth - orig.w);
      const ny = clampPx(orig.y + (p.y - start.y), overlay.clientHeight - orig.h);
      el.style.left = nx + 'px';
      el.style.top = ny + 'px';
    }
    function onUp(ev) {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const map = loadHotspots();
      map[seatId] = norm({
        x: parseFloat(el.style.left),
        y: parseFloat(el.style.top),
        w: parseFloat(el.style.width),
        h: parseFloat(el.style.height),
      }, overlay);
      saveHotspots(map);
      renderRects();
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    e.preventDefault();
  }

  function clampPx(v, max) { return Math.min(max, Math.max(0, v)); }

  /* ---------- 导出 ---------- */
  function exportJSON() {
    const map = loadHotspots();
    const payload = {
      _comment: '座位在楼层图上的位置（百分比，相对图片宽高）。可粘贴回 config.js 或用于备份。',
      hotspots: map,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'seat_hotspots.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ---------- 启动 ---------- */
  window.addEventListener('hashchange', () => { if (isCal()) show(); });
  document.addEventListener('DOMContentLoaded', () => { if (isCal()) show(); });
})();
