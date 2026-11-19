// 조절판에서 바꿀 수 있는 값 (브라우저에 저장됨)
export const DEFAULTS = {
  packTime: 0.8,     // 눈 하나 뭉치는 시간(초)
  chargeTime: 1,     // 최대 차지까지 걸리는 시간(초)
  minRange: 8,       // 차지 0일 때 사거리(m)
  maxRange: 20,      // 최대 차지 사거리(m)
  speed: 6,          // 이동 속도(m/s)
  chargeSlow: 0.5,   // 차지 중 이동 속도 배율
  dashCooldown: 2,   // 대시 쿨타임(초)
};

export const CFG = { ...DEFAULTS };
try {
  const saved = JSON.parse(localStorage.getItem('snow-cfg') || '{}');
  for (const k of Object.keys(DEFAULTS)) if (typeof saved[k] === 'number') CFG[k] = saved[k];
} catch { /* 저장소를 못 쓰는 환경 */ }

export function saveCfg() {
  try { localStorage.setItem('snow-cfg', JSON.stringify(CFG)); } catch { /* noop */ }
}
export function resetCfg() {
  Object.assign(CFG, DEFAULTS);
  try { localStorage.removeItem('snow-cfg'); } catch { /* noop */ }
}

// 고정 규칙
export const RULES = {
  maxAmmo: 3,
  startAmmo: 1,
  hp: 3,
  roundsToWin: 2,
  wallHp: 2,
  gravity: 22,
  throwHeight: 1.3,
  dashSpeed: 15,
  dashTime: 0.18,
};

export const ARENA = { w: 30, d: 20 };

// 조절판 슬라이더 정의: [키, 이름, 최소, 최대, 간격, 단위]
export const TUNE = [
  ['packTime', '눈 하나 뭉치는 시간', 0.3, 2, 0.05, '초'],
  ['chargeTime', '최대 차지까지 걸리는 시간', 0.3, 2, 0.05, '초'],
  ['minRange', '최소 사거리', 4, 14, 0.5, 'm'],
  ['maxRange', '최대 사거리', 10, 30, 0.5, 'm'],
  ['speed', '이동 속도', 3, 10, 0.25, 'm/s'],
  ['chargeSlow', '차지 중 이동 속도 배율', 0.2, 1, 0.05, '배'],
  ['dashCooldown', '대시 쿨타임', 0.5, 5, 0.25, '초'],
];
