/* =========================================================================
 * config.js —— 座位与实验配置（几乎全部可调内容都集中在这里）
 * 团队修改座位属性、场景文案、空座率、诉求项、量表条目时，只改这个文件即可。
 * 图片路径相对于 index.html 所在目录。
 * ========================================================================= */

/* ---------------- 楼层平面图 ---------------- */
const FLOORS = [
  { id: '3', name: '3 楼', image: 'Floor3.jpg' },
  { id: '5', name: '5 楼', image: 'Floor5.jpg' },
  { id: '6', name: '6 楼', image: 'Floor6.jpg' },
  { id: '7', name: '7 楼', image: 'Floor7.png' },
  { id: '8', name: '8 楼', image: 'Floor8.jpg' },
];

/* ---------------- 座位 / 区域 ----------------
 * quiet   安静      outlet  有插座      single  单人位
 * discuss 可讨论    capacity  可容纳人数
 * emptyNormal  平时空座率(%)     emptyPeak  高峰(场景 C)空座率(%)
 * ------------------------------------------------------------------------- */
const SEATS = [
  { id: '3F-01', floor: '3', name: '3楼01', quiet: false, outlet: false, single: false, discuss: true,  capacity: 6, emptyNormal: 55, emptyPeak: 15, photo: '3楼01.jpg' },
  { id: '3F-02', floor: '3', name: '3楼02', quiet: false, outlet: false, single: false, discuss: true,  capacity: 4, emptyNormal: 70, emptyPeak: 20, photo: '3楼02.jpg' },
  { id: '3F-03', floor: '3', name: '3楼03', quiet: false, outlet: false, single: false, discuss: true,  capacity: 8, emptyNormal: 40, emptyPeak: 5,  photo: '3楼03.jpg' },
  { id: '3F-04', floor: '3', name: '3楼04', quiet: true,  outlet: true,  single: false, discuss: false, capacity: 1, emptyNormal: 65, emptyPeak: 25, photo: '3楼04.jpg' },
  { id: '5F-01', floor: '5', name: '5楼01', quiet: false, outlet: true,  single: true,  discuss: false, capacity: 1, emptyNormal: 80, emptyPeak: 30, photo: '5楼01.jpg' },
  { id: '5F-02', floor: '5', name: '5楼02', quiet: true,  outlet: true,  single: false, discuss: false, capacity: 2, emptyNormal: 60, emptyPeak: 18, photo: '5楼02.jpg' },
  { id: '5F-03', floor: '5', name: '5楼03', quiet: true,  outlet: false, single: false, discuss: false, capacity: 2, emptyNormal: 75, emptyPeak: 22, photo: '5楼03.jpg' },
  { id: '6F-01', floor: '6', name: '6楼01', quiet: true,  outlet: false, single: true,  discuss: false, capacity: 1, emptyNormal: 50, emptyPeak: 12, photo: '6楼01.jpg' },
  { id: '6F-02', floor: '6', name: '6楼02', quiet: true,  outlet: false, single: true,  discuss: false, capacity: 1, emptyNormal: 45, emptyPeak: 8,  photo: '6楼02.jpg' },
  { id: '7F-01', floor: '7', name: '7楼01', quiet: true,  outlet: true,  single: false, discuss: false, capacity: 2, emptyNormal: 35, emptyPeak: 15, photo: '7楼01.jpg' },
  { id: '7F-02', floor: '7', name: '7楼02', quiet: true,  outlet: true,  single: false, discuss: false, capacity: 2, emptyNormal: 30, emptyPeak: 10, photo: '7楼02.jpg' },
  { id: '8F-01', floor: '8', name: '8楼01', quiet: false, outlet: true,  single: false, discuss: false, capacity: 2, emptyNormal: 85, emptyPeak: 40, photo: '8楼01.jpg' },
];

/* ---------------- 三个场景 ----------------
 * isCorrect(seat)：给定被锁定的座位，判断是否为“正确解”（用于计算错误率）
 * peak：是否高峰期（决定用 emptyNormal 还是 emptyPeak 展示空座率）
 * ------------------------------------------------------------------------- */
const SCENARIOS = [
  {
    id: 'A',
    title: '场景 A · 紧急单人位 + 电源',
    desc: '你马上要开一个线上会议，需要一个独立不被打扰的单人位，并且必须要有电源插座。请尽快找到并锁定一个座位。',
    isCorrect: (s) => s.single && s.outlet,
    hintNeeds: ['single', 'outlet'],
    peak: false,
  },
  {
    id: 'B',
    title: '场景 B · 小组协作 + 允许讨论',
    desc: '你和 3 位同学要一起讨论项目，需要一张能坐下 4 人、且允许自由讨论的桌子。请尽快找到并锁定。',
    isCorrect: (s) => s.discuss && s.capacity >= 4,
    hintNeeds: ['discuss'],
    peak: false,
  },
  {
    id: 'C',
    title: '场景 C · 刚下课，45 分钟后上课（高峰）',
    desc: '现在正是刚下课的高峰期，多数座位已经满员。请在 45 分钟内找到一个当前仍有空位的座位（空座率 ≥ 20%），尽快锁定。',
    isCorrect: (s) => emptyRate(s, true) >= 20,
    hintNeeds: ['available'],
    peak: true,
  },
];

/* ---------------- 方案 B 的“诉求”（可多选） ---------------- */
const NEEDS = [
  { id: 'quiet',     label: '安静',   icon: '🔇' },
  { id: 'outlet',    label: '有插座', icon: '🔌' },
  { id: 'single',    label: '单人位', icon: '👤' },
  { id: 'discuss',   label: '可讨论', icon: '💬' },
  { id: 'available', label: '空位多', icon: '🪑' },
];

/* ---------------- NASA-TLX 认知负荷量表（0–100） ---------------- */
const NASA_TLX = [
  { id: 'mental',      label: '脑力需求', desc: '完成任务需要多少脑力活动（思考、判断、记忆、搜寻）？' },
  { id: 'physical',    label: '体力需求', desc: '完成任务需要多少体力活动（点击、浏览、滚动、移动）？' },
  { id: 'temporal',    label: '时间压力', desc: '任务过程中你感到多大的时间压力或紧迫感？' },
  { id: 'performance', label: '绩效',     desc: '你对自己找到座位这一表现有多满意？（分数越高越满意）' },
  { id: 'effort',      label: '努力程度', desc: '为达到目前表现，你付出了多少努力？' },
  { id: 'frustration', label: '受挫程度', desc: '过程中你感到多少挫败、烦躁或不安全？' },
];

/* ---------------- 满意度快问快答（3 题） ---------------- */
const SATISFACTION = [
  { id: 's1', q: '我能快速找到符合要求的座位。' },
  { id: 's2', q: '这种找座位的方式清晰、容易使用。' },
  { id: 's3', q: '整体上，我对这种方式感到满意。' },
];
const SATISFACTION_SCALE = [
  { v: 1, label: '完全不同意' },
  { v: 2, label: '不同意' },
  { v: 3, label: '一般' },
  { v: 4, label: '同意' },
  { v: 5, label: '完全同意' },
];

/* ---------------- 其它可调参数 ---------------- */
const RANDOMIZE_SCENARIO_ORDER = false; // true=每个方案块内打乱 3 个场景顺序
const AVAILABLE_MIN_RATE = 20;           // “空位多 / 有空位”的空座率阈值（%）
const SCHEME_NAMES = {
  A: '方案 A · 自主筛选浏览',
  B: '方案 B · 智能推荐',
};

/* =========================================================================
 * 以下为工具函数，一般无需修改
 * ========================================================================= */

/* 当前场景对应的空座率 */
function emptyRate(seat, peak) {
  return peak ? seat.emptyPeak : seat.emptyNormal;
}

/* 某个座位是否满足某个诉求 */
function seatMatchesNeed(seat, needId, peak) {
  switch (needId) {
    case 'quiet':     return !!seat.quiet;
    case 'outlet':    return !!seat.outlet;
    case 'single':    return !!seat.single;
    case 'discuss':   return !!seat.discuss;
    case 'available': return emptyRate(seat, peak) >= AVAILABLE_MIN_RATE;
    default: return false;
  }
}

/* 座位满足的标签列表（用于详情展示） */
function seatTags(seat, peak) {
  const tags = [];
  if (seat.quiet)   tags.push('安静');
  if (seat.outlet)  tags.push('有插座');
  if (seat.single)  tags.push('单人位');
  if (seat.discuss) tags.push('可讨论');
  if (emptyRate(seat, peak) >= AVAILABLE_MIN_RATE) tags.push('空位多');
  return tags;
}

/* ---------------- 打点标定（座位在地图上的位置）持久化 ---------------- */
const HOTSPOT_KEY = 'hci_seat_hotspots_v1';

function loadHotspots() {
  try { return JSON.parse(localStorage.getItem(HOTSPOT_KEY)) || {}; } catch (e) { return {}; }
}

function saveHotspots(map) {
  try { localStorage.setItem(HOTSPOT_KEY, JSON.stringify(map)); } catch (e) {}
}

/* 返回某座位在楼层图上的区域，格式 { x, y, w, h }，均为百分比(0–100)，未标定返回 null */
function hotspotOf(seatId) {
  return loadHotspots()[seatId] || null;
}
