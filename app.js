/* =========================================================================
 * app.js —— 实验主逻辑
 * 分组轮换（平衡拉丁方）、方案 A（筛选浏览）/ 方案 B（智能推荐）、
 * 计时埋点、NASA-TLX + 满意度问卷、结果导出（JSON / CSV）。
 * 依赖 config.js（先加载）。
 * ========================================================================= */

(function () {
  'use strict';

  // 如果进入标定模式，跳过实验初始化（由 calibrate.js 接管）
  if (location.hash === '#calibrate') return;

  const SESSION_KEY = 'hci_session_v1';

  /* ---------------- 状态 ---------------- */
  let S = {
    subjectId: '',
    group: null,            // 1 或 2
    blocks: [],             // [{scheme:'A'|'B', scenarios:['A','B','C']}, ...]
    blockIndex: -1,         // 当前方案块索引；-1 表示“待开始（说明页）”
    scenarioIndex: 0,       // 当前块内场景索引
    tasks: [],              // 已完成的任务记录
    questionnaires: {},     // { 'A': {...}, 'B': {...} }
    startedAt: null,
  };

  // 方案 A 的瞬时 UI 状态
  let stateA = { floor: '3', filters: [] };
  // 方案 B 的瞬时 UI 状态
  let stateB = { needs: [] };
  // 当前任务埋点
  let task = null;

  /* ---------------- DOM 快捷方式 ---------------- */
  const $ = (id) => document.getElementById(id);

  /* ---------------- 工具 ---------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach((el) => el.classList.add('hidden'));
    $(id).classList.remove('hidden');
    window.scrollTo(0, 0);
  }

  function save() {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(S)); } catch (e) {}
  }

  function load() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
  }

  function currentBlock() {
    return S.blocks[S.blockIndex] || null;
  }

  function currentScenario() {
    const b = currentBlock();
    if (!b) return null;
    return SCENARIOS.find((sc) => sc.id === b.scenarios[S.scenarioIndex]) || null;
  }

  function schemeName(scheme) {
    return SCHEME_NAMES[scheme] || scheme;
  }

  function renderSessionInfo() {
    const el = $('session-info');
    if (!el) return;
    if (S.subjectId) {
      const b = currentBlock();
      const blk = S.blockIndex >= 0 ? ` · ${schemeName(b ? b.scheme : '')}` : '';
      el.textContent = `被试 ${S.subjectId} · 组 ${S.group}${blk}`;
    } else {
      el.textContent = '';
    }
  }

  /* ---------------- 流程推进 ---------------- */
  function nextStep() {
    renderSessionInfo();
    if (S.blockIndex < 0) {
      renderInstructions();
      return;
    }
    if (S.blockIndex >= S.blocks.length) {
      renderDone();
      return;
    }
    const block = currentBlock();
    if (S.scenarioIndex < block.scenarios.length) {
      beginScenario(block, S.scenarioIndex);
    } else {
      renderQuestionnaire(block.scheme);
    }
  }

  /* ---------------- 知情同意 / 分组 ---------------- */
  function initConsent() {
    showScreen('screen-consent');
    $('btn-start').addEventListener('click', onConsentStart);

    // 若存在未完成会话，提供“继续”
    const saved = load();
    if (saved && saved.blocks && saved.blocks.length) {
      const resumeBtn = document.createElement('button');
      resumeBtn.className = 'btn btn-ghost';
      resumeBtn.textContent = `↻ 继续上次实验（被试 ${saved.subjectId} · 组 ${saved.group}）`;
      resumeBtn.addEventListener('click', () => {
        S = Object.assign({}, S, saved);
        nextStep();
      });
      $('screen-consent').querySelector('.card:last-child').appendChild(resumeBtn);
    }
  }

  function onConsentStart() {
    const sid = $('subject-id').value.trim();
    if (!sid) { alert('请填写被试编号。'); return; }
    if (!$('consent-check').checked) { alert('请先勾选知情同意。'); return; }

    const groupChoice = $('group-select').value;
    const group = groupChoice === 'random' ? (Math.random() < 0.5 ? 1 : 2) : Number(groupChoice);

    S.subjectId = sid;
    S.group = group;
    S.startedAt = Date.now();
    S.tasks = [];
    S.questionnaires = {};
    S.blockIndex = -1;
    S.scenarioIndex = 0;
    S.blocks = buildBlocks(group);
    save();

    renderInstructions();
  }

  function buildBlocks(group) {
    const first = group === 1 ? 'A' : 'B';
    const second = first === 'A' ? 'B' : 'A';
    const order = (scheme) => {
      const ids = ['A', 'B', 'C'];
      if (RANDOMIZE_SCENARIO_ORDER) {
        for (let i = ids.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [ids[i], ids[j]] = [ids[j], ids[i]];
        }
      }
      return ids;
    };
    return [
      { scheme: first, scenarios: order(first) },
      { scheme: second, scenarios: order(second) },
    ];
  }

  /* ---------------- 说明页 ---------------- */
  function renderInstructions() {
    showScreen('screen-instructions');
    const box = $('instructions-scenarios');
    box.innerHTML = SCENARIOS.map((sc) => `
      <div class="scenario-banner" style="margin-bottom:12px">
        <span class="tag">${esc(sc.id)}</span>
        <h2 style="margin:2px 0 4px">${esc(sc.title)}</h2>
        <p>${esc(sc.desc)}</p>
      </div>`).join('');
    $('btn-instructions-start').onclick = () => {
      S.blockIndex = 0;
      S.scenarioIndex = 0;
      save();
      nextStep();
    };
  }

  /* ---------------- 场景（任务） ---------------- */
  function beginScenario(block, scenarioIndex) {
    const scenario = SCENARIOS.find((sc) => sc.id === block.scenarios[scenarioIndex]) || null;
    if (!scenario) { renderDone(); return; }

    // 重置瞬时状态
    stateA = { floor: '3', filters: [] };
    stateB = { needs: [] };
    task = {
      scheme: block.scheme,
      scenarioId: scenario.id,
      scenarioTitle: scenario.title,
      startTs: null,
      firstDetailTs: null,
      lockTs: null,
      clicks: 0,
      filters: [],
      needs: [],
      seatId: null,
      seatName: null,
      correct: null,
    };

    const blockNo = S.blockIndex + 1;
    const totalBlocks = S.blocks.length;
    const sceneNo = scenarioIndex + 1;
    const sceneTotal = block.scenarios.length;

    $('screen-task').innerHTML = `
      <div class="progress-wrap">
        <span class="muted">方式 ${blockNo}/${totalBlocks} · ${esc(schemeName(block.scheme))}</span>
        <div class="progress-bar"><div class="progress-fill" style="width:${Math.round((scenarioIndex / sceneTotal) * 100)}%"></div></div>
        <span class="muted">场景 ${sceneNo}/${sceneTotal}</span>
      </div>
      <div class="scenario-banner">
        <span class="tag">${esc(schemeName(block.scheme))}</span>
        <h2>${esc(scenario.title)}</h2>
        <p>${esc(scenario.desc)}</p>
      </div>
      <div class="card center" id="task-body">
        <p style="font-size:18px">准备就绪后点击下方按钮，开始计时寻找座位。</p>
        <button class="btn btn-primary" id="btn-task-start" style="margin-top:8px">🚀 我准备好了，开始找座位</button>
      </div>`;

    showScreen('screen-task');
    $('btn-task-start').addEventListener('click', () => startTask(block, scenario));
  }

  function startTask(block, scenario) {
    task.startTs = Date.now();
    const body = $('task-body');
    body.innerHTML = '';
    if (block.scheme === 'A') {
      renderSchemeA(scenario, body);
    } else {
      renderSchemeB(scenario, body);
    }
    save();
  }

  function bump() {
    if (task) task.clicks += 1;
  }

  /* =========================================================
   * 方案 A：多维筛选 + 平面图浏览
   * ========================================================= */
  const FILTERS_A = [
    { id: 'quiet',  label: '安静' },
    { id: 'outlet', label: '有插座' },
    { id: 'single', label: '单人位' },
  ];

  function renderSchemeA(scenario, container) {
    container.className = 'card';
    container.innerHTML = `
      <div class="task-layout">
        <div class="filter-panel">
          <h3>筛选条件</h3>
          <div class="filter-group">
            <div class="gtitle">座位属性（可多选）</div>
            ${FILTERS_A.map((f) => `
              <div class="check-line">
                <input type="checkbox" id="f-${f.id}" ${stateA.filters.includes(f.id) ? 'checked' : ''}>
                <label for="f-${f.id}" style="margin:0;font-weight:400">${esc(f.label)}</label>
              </div>`).join('')}
            <button class="btn btn-ghost btn-sm" id="btn-clear-filter" style="margin-top:8px">清除筛选</button>
          </div>
          <div class="filter-group">
            <div class="gtitle">选择楼层</div>
            <div class="floor-tabs" id="floor-tabs">
              ${FLOORS.map((fl) => `<button class="floor-tab ${fl.id === stateA.floor ? 'active' : ''}" data-floor="${fl.id}">${esc(fl.name)}</button>`).join('')}
            </div>
          </div>
          <div class="hint-note">勾选属性后，右侧楼层图会以红色标出匹配区域；也可点击下方座位列表查看详情。</div>
        </div>
        <div class="map-area" id="map-area"></div>
      </div>`;

    FILTERS_A.forEach((f) => {
      $(`f-${f.id}`).addEventListener('change', (e) => {
        bump();
        if (e.target.checked) stateA.filters.push(f.id);
        else stateA.filters = stateA.filters.filter((x) => x !== f.id);
        task.filters = stateA.filters.slice();
        renderMap(scenario);
      });
    });
    $('btn-clear-filter').addEventListener('click', () => {
      bump();
      stateA.filters = [];
      task.filters = [];
      FILTERS_A.forEach((f) => { $(`f-${f.id}`).checked = false; });
      renderMap(scenario);
    });
    $('floor-tabs').addEventListener('click', (e) => {
      const btn = e.target.closest('.floor-tab');
      if (!btn) return;
      bump();
      stateA.floor = btn.dataset.floor;
      document.querySelectorAll('.floor-tab').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderMap(scenario);
    });

    renderMap(scenario);
  }

  function renderMap(scenario) {
    const area = $('map-area');
    const floor = FLOORS.find((f) => f.id === stateA.floor);
    const seats = SEATS.filter((s) => s.floor === stateA.floor);
    const peak = scenario.peak;

    const matchSeat = (s) => stateA.filters.length > 0 &&
      stateA.filters.every((fid) => seatMatchesNeed(s, fid, peak));

    const anyHotspot = seats.some((s) => hotspotOf(s.id));

    area.innerHTML = `
      <div class="map-scroll">
        <div class="map-wrap" id="map-wrap">
          <img class="map-img" id="map-img" src="${esc(floor.image)}" alt="${esc(floor.name)}平面图">
          <div class="map-overlay" id="map-overlay"></div>
        </div>
      </div>
      ${anyHotspot ? '' : '<div class="hint-note">本楼层尚未在图上标定座位位置，请使用下方座位列表选择（或先到“打点标定工具”标定）。</div>'}
      <div class="seat-list">
        <div class="gtitle">${esc(floor.name)}座位列表</div>
        ${seats.map((s) => `
          <button class="seat-chip ${matchSeat(s) ? 'match' : ''}" data-seat="${s.id}">
            ${esc(s.name)} · 空座率 ${emptyRate(s, peak)}%
          </button>`).join('')}
      </div>`;

    // 座位列表点击
    area.querySelectorAll('.seat-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const s = SEATS.find((x) => x.id === btn.dataset.seat);
        openSeatDetail(s, scenario, peak);
      });
    });

    // 热点定位
    const img = $('map-img');
    const place = () => placeHotspots(img, $('map-overlay'), seats, scenario, peak, matchSeat);
    if (img.complete && img.naturalWidth) place();
    else img.onload = place;
  }

  function placeHotspots(img, overlay, seats, scenario, peak, matchSeat) {
    overlay.innerHTML = '';
    const w = img.clientWidth || img.naturalWidth;
    const h = img.clientHeight || img.naturalHeight;
    if (!w || !h) return;

    seats.forEach((s) => {
      const hp = hotspotOf(s.id);
      if (!hp) return;
      const x = (hp.x / 100) * w;
      const y = (hp.y / 100) * h;
      const ww = (hp.w / 100) * w;
      const hh = (hp.h / 100) * h;
      const el = document.createElement('div');
      el.className = 'hotspot ' + (matchSeat(s) ? '' : 'dim');
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.style.width = ww + 'px';
      el.style.height = hh + 'px';
      el.textContent = s.name;
      el.addEventListener('click', () => openSeatDetail(s, scenario, peak));
      overlay.appendChild(el);
    });
  }

  function openSeatDetail(seat, scenario, peak) {
    bump();
    if (task && !task.firstDetailTs) task.firstDetailTs = Date.now();
    const tags = seatTags(seat, peak);
    const tagsHtml = tags.length
      ? tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')
      : '<span class="tag" style="background:#f0f2f6;color:#6b7480">无特殊标签</span>';

    $('modal-card').innerHTML = `
      <img class="hero" src="${esc(seat.photo)}" alt="${esc(seat.name)}">
      <div class="modal-body">
        <h3>${esc(seat.name)}</h3>
        <div class="muted" style="margin-bottom:10px">${esc(FLOORS.find(f=>f.id===seat.floor).name)} · 可容纳 ${seat.capacity} 人 · 当前空座率 <strong>${emptyRate(seat, peak)}%</strong></div>
        <div class="tag-row">${tagsHtml}</div>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="btn-modal-cancel">再想想</button>
          <button class="btn btn-primary" id="btn-modal-lock">🔒 锁定此座位</button>
        </div>
      </div>`;
    $('modal').classList.remove('hidden');
    $('btn-modal-cancel').addEventListener('click', closeModal);
    $('btn-modal-lock').addEventListener('click', () => { closeModal(); lockSeat(seat); });
  }

  function closeModal() {
    $('modal').classList.add('hidden');
    $('modal-card').innerHTML = '';
  }

  /* =========================================================
   * 方案 B：智能推荐 + 一键直达
   * ========================================================= */
  function renderSchemeB(scenario, container) {
    container.className = 'card';
    const peak = scenario.peak;
    container.innerHTML = `
      <div class="gtitle" style="font-weight:600;margin-bottom:10px">请选择你这次找座位最看重的诉求（可多选）：</div>
      <div class="need-chips" id="need-chips">
        ${NEEDS.map((n) => `
          <div class="need-chip ${stateB.needs.includes(n.id) ? 'selected' : ''}" data-need="${n.id}">
            ${n.icon} ${esc(n.label)}
          </div>`).join('')}
      </div>
      <div class="center">
        <button class="btn btn-primary" id="btn-recommend" ${stateB.needs.length ? '' : 'disabled'}>✨ 智能推荐</button>
      </div>
      <div id="rec-results"></div>`;

    $('need-chips').addEventListener('click', (e) => {
      const chip = e.target.closest('.need-chip');
      if (!chip) return;
      bump();
      const id = chip.dataset.need;
      if (stateB.needs.includes(id)) stateB.needs = stateB.needs.filter((x) => x !== id);
      else stateB.needs.push(id);
      task.needs = stateB.needs.slice();
      chip.classList.toggle('selected');
      $('btn-recommend').disabled = stateB.needs.length === 0;
      $('rec-results').innerHTML = '';
    });

    $('btn-recommend').addEventListener('click', () => {
      bump();
      if (task && !task.firstDetailTs) task.firstDetailTs = Date.now();
      renderRecommendations(scenario, peak);
    });
  }

  function recommend(needs, peak) {
    return SEATS
      .map((s) => {
        const matched = needs.filter((n) => seatMatchesNeed(s, n, peak)).length;
        const rate = emptyRate(s, peak);
        const score = matched * 1000 + rate; // 满足诉求数优先，空座率作为同分排序
        return { seat: s, matched, perfect: matched === needs.length, rate, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }

  function renderRecommendations(scenario, peak) {
    const box = $('rec-results');
    if (!stateB.needs.length) { box.innerHTML = ''; return; }
    const top = recommend(stateB.needs, peak);
    box.innerHTML = `
      <div class="gtitle" style="font-weight:600;margin-top:20px">为你推荐 Top ${top.length}：</div>
      <div class="rec-grid">
        ${top.map((r, i) => `
          <div class="rec-card ${i === 0 ? 'best' : ''}">
            <img src="${esc(r.seat.photo)}" alt="${esc(r.seat.name)}">
            <div class="rec-body">
              <span class="rec-rank">${i + 1}</span>
              <h3 class="rec-title">${esc(r.seat.name)}</h3>
              <div class="rec-sub">${esc(FLOORS.find(f=>f.id===r.seat.floor).name)} · 当前空座率 <strong>${r.rate}%</strong></div>
              <div class="rec-match ${r.perfect ? 'full' : 'part'}">${r.perfect ? '✅ 符合您的所有要求' : `⚠️ 部分符合（满足 ${r.matched}/${stateB.needs.length} 项诉求）`}</div>
              <div class="tag-row">
                ${seatTags(r.seat, peak).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}
              </div>
              <button class="btn btn-primary btn-sm" data-seat="${esc(r.seat.id)}" style="margin-top:auto">🔒 锁定此座位</button>
            </div>
          </div>`).join('')}
      </div>`;

    box.querySelectorAll('[data-seat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const s = SEATS.find((x) => x.id === btn.dataset.seat);
        lockSeat(s);
      });
    });
  }

  /* ---------------- 锁定座位 & 记录 ---------------- */
  function lockSeat(seat) {
    if (!task || task.lockTs) return; // 防止重复
    const sc = currentScenario();
    task.lockTs = Date.now();
    task.seatId = seat.id;
    task.seatName = seat.name;
    task.correct = sc ? sc.isCorrect(seat) : null;
    task.filters = stateA.filters.slice();
    task.needs = stateB.needs.slice();

    S.tasks.push(Object.assign({}, task, {
      elapsedSec: (task.lockTs - task.startTs) / 1000,
      searchSec: task.firstDetailTs ? (task.firstDetailTs - task.startTs) / 1000 : (task.lockTs - task.startTs) / 1000,
      decisionSec: task.firstDetailTs ? (task.lockTs - task.firstDetailTs) / 1000 : 0,
    }));
    task = null;
    S.scenarioIndex += 1;
    save();
    nextStep();
  }

  /* ---------------- 问卷 ---------------- */
  function renderQuestionnaire(scheme) {
    if (S.questionnaires[scheme]) { advanceAfterQuestionnaire(); return; }

    $('screen-questionnaire').innerHTML = `
      <div class="card">
        <h1>主观问卷</h1>
        <p class="muted">请回想你刚刚使用的 <strong>${esc(schemeName(scheme))}</strong>，填写以下量表。</p>
      </div>
      <div class="card">
        <h2>NASA-TLX 认知负荷量表</h2>
        ${NASA_TLX.map((it) => `
          <div class="tlx-item">
            <div class="q">${esc(it.label)} <small>${esc(it.desc)}</small></div>
            <div class="range-row">
              <input type="range" min="0" max="100" step="5" value="50" data-tlx="${it.id}">
              <span class="range-val" id="val-${it.id}">50</span>
            </div>
            <div class="range-labels"><span>0 · 很低</span><span>100 · 很高</span></div>
          </div>`).join('')}
      </div>
      <div class="card">
        <h2>满意度快问快答</h2>
        ${SATISFACTION.map((it, qi) => `
          <div class="tlx-item">
            <div class="q">${qi + 1}. ${esc(it.q)}</div>
            <div class="likert-row" data-likert="${it.id}">
              ${SATISFACTION_SCALE.map((lv) => `
                <div class="likert-opt" data-v="${lv.v}">${lv.v}<br>${esc(lv.label)}</div>`).join('')}
            </div>
          </div>`).join('')}
      </div>
      <div class="card center">
        <button class="btn btn-primary btn-block" id="btn-questionnaire-submit">提交问卷</button>
      </div>`;

    showScreen('screen-questionnaire');

    document.querySelectorAll('input[type="range"]').forEach((r) => {
      r.addEventListener('input', () => { $('val-' + r.dataset.tlx).textContent = r.value; });
    });

    const likertValues = {};
    document.querySelectorAll('[data-likert]').forEach((group) => {
      const key = group.dataset.likert;
      group.querySelectorAll('.likert-opt').forEach((opt) => {
        opt.addEventListener('click', () => {
          likertValues[key] = Number(opt.dataset.v);
          group.querySelectorAll('.likert-opt').forEach((o) => o.classList.remove('selected'));
          opt.classList.add('selected');
        });
      });
    });

    $('btn-questionnaire-submit').addEventListener('click', () => {
      // 校验满意度每题都已选
      for (const it of SATISFACTION) {
        if (likertValues[it.id] == null) { alert(`请完成满意度第 ${SATISFACTION.findIndex(x=>x.id===it.id)+1} 题。`); return; }
      }
      const nasa = {};
      NASA_TLX.forEach((it) => {
        const r = document.querySelector(`[data-tlx="${it.id}"]`);
        nasa[it.id] = r ? Number(r.value) : null;
      });
      S.questionnaires[scheme] = {
        scheme,
        nasa,
        satisfaction: Object.assign({}, likertValues),
        submittedAt: Date.now(),
      };
      save();
      advanceAfterQuestionnaire();
    });
  }

  function advanceAfterQuestionnaire() {
    S.blockIndex += 1;
    S.scenarioIndex = 0;
    save();
    nextStep();
  }

  /* ---------------- 完成 / 导出 ---------------- */
  function renderDone() {
    showScreen('screen-done');
    const summary = summarize();
    $('screen-done').innerHTML = `
      <div class="card center">
        <h1>🎉 实验完成，感谢你的参与！</h1>
        <p class="muted">你的匿名操作数据已记录，可以请主试导出结果。</p>
      </div>
      <div class="card">
        <h2>本次记录概览</h2>
        <div class="stat-grid">
          <div class="stat"><div class="num">${S.tasks.length}</div><div class="lbl">完成任务数</div></div>
          <div class="stat"><div class="num">${summary.correctA}/${summary.totalA}</div><div class="lbl">方案 A 正确数</div></div>
          <div class="stat"><div class="num">${summary.correctB}/${summary.totalB}</div><div class="lbl">方案 B 正确数</div></div>
          <div class="stat"><div class="num">${summary.avgA.toFixed(1)}s / ${summary.avgB.toFixed(1)}s</div><div class="lbl">A / B 平均耗时</div></div>
        </div>
        <div class="export-btns">
          <button class="btn btn-primary" id="btn-export-json">⬇ 导出 JSON</button>
          <button class="btn btn-primary" id="btn-export-tasks">⬇ 导出任务 CSV</button>
          <button class="btn btn-primary" id="btn-export-q">⬇ 导出问卷 CSV</button>
          <button class="btn btn-danger" id="btn-reset">🧹 为下一位被试重置</button>
        </div>
        <p class="muted" style="margin-top:12px">重置会清空本次会话数据（保留座位标定）。</p>
      </div>`;

    $('btn-export-json').addEventListener('click', () => downloadJSON(buildResults()));
    $('btn-export-tasks').addEventListener('click', () => downloadTasksCSV(buildResults()));
    $('btn-export-q').addEventListener('click', () => downloadQuestionnaireCSV(buildResults()));
    $('btn-reset').addEventListener('click', () => {
      if (confirm('确认重置？本次被试数据将被清空。')) {
        clearSession();
        location.hash = '';
        location.reload();
      }
    });
  }

  function summarize() {
    const tA = S.tasks.filter((t) => t.scheme === 'A');
    const tB = S.tasks.filter((t) => t.scheme === 'B');
    const correctA = tA.filter((t) => t.correct).length;
    const correctB = tB.filter((t) => t.correct).length;
    const avg = (arr) => arr.length ? arr.reduce((s, t) => s + t.elapsedSec, 0) / arr.length : 0;
    return { totalA: tA.length, totalB: tB.length, correctA, correctB, avgA: avg(tA), avgB: avg(tB) };
  }

  function buildResults() {
    return {
      meta: {
        subjectId: S.subjectId,
        group: S.group,
        groupLabel: S.group === 1 ? '先A后B' : '先B后A',
        schemeOrder: S.blocks.map((b) => b.scheme),
        startedAt: S.startedAt,
        exportedAt: Date.now(),
      },
      tasks: S.tasks,
      questionnaires: S.questionnaires,
    };
  }

  function downloadJSON(data) {
    triggerDownload(
      JSON.stringify(data, null, 2),
      `results_${S.subjectId}.json`,
      'application/json'
    );
  }

  function csvCell(v) {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function downloadTasksCSV(data) {
    const head = ['subjectId', 'group', 'scheme', 'scenario', 'scenarioTitle',
      'elapsedSec', 'searchSec', 'decisionSec', 'clicks', 'seatId', 'seatName',
      'correct', 'filters', 'needs'];
    const rows = data.tasks.map((t) => [
      data.meta.subjectId, data.meta.group, t.scheme, t.scenarioId, t.scenarioTitle,
      t.elapsedSec.toFixed(2), t.searchSec.toFixed(2), t.decisionSec.toFixed(2),
      t.clicks, t.seatId, t.seatName, t.correct ? 1 : 0,
      (t.filters || []).join('|'), (t.needs || []).join('|'),
    ]);
    const csv = [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
    triggerDownload('\ufeff' + csv, `tasks_${data.meta.subjectId}.csv`, 'text/csv;charset=utf-8');
  }

  function downloadQuestionnaireCSV(data) {
    const head = ['subjectId', 'group', 'scheme',
      'nasa_mental', 'nasa_physical', 'nasa_temporal', 'nasa_performance', 'nasa_effort', 'nasa_frustration',
      'sat_s1', 'sat_s2', 'sat_s3'];
    const rows = Object.values(data.questionnaires).map((q) => [
      data.meta.subjectId, data.meta.group, q.scheme,
      q.nasa.mental, q.nasa.physical, q.nasa.temporal, q.nasa.performance, q.nasa.effort, q.nasa.frustration,
      q.satisfaction.s1, q.satisfaction.s2, q.satisfaction.s3,
    ]);
    const csv = [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
    triggerDownload('\ufeff' + csv, `questionnaire_${data.meta.subjectId}.csv`, 'text/csv;charset=utf-8');
  }

  function triggerDownload(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ---------------- 恢复会话 ---------------- */
  function resumeFlow() {
    if (!S.blocks || !S.blocks.length) { initConsent(); return; }
    if (S.blockIndex < 0) { renderInstructions(); return; }
    nextStep();
  }

  /* ---------------- 启动 ---------------- */
  document.addEventListener('DOMContentLoaded', () => {
    const saved = load();
    if (saved && saved.blocks && saved.blocks.length) {
      // 已完成会话：跳到结束页以便导出/重置；进行中会话：按状态恢复
      S = Object.assign({}, S, saved);
      resumeFlow();
    } else {
      initConsent();
    }
  });
})();
