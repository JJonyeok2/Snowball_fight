// 서버와 클라이언트가 같이 쓰는 규칙

// 연습 모드 설정 패널에서 바꿀 수 있는 값 (온라인은 항상 기본값)
export const DEFAULTS = {
  packTime: 0.8,     // 눈 하나 뭉치는 시간(초)
  chargeTime: 1,     // 최대 차지까지 걸리는 시간(초)
  minRange: 8,       // 차지 0일 때 사거리(m)
  maxRange: 20,      // 최대 차지 사거리(m)
  speed: 6,          // 이동 속도(m/s)
  chargeSlow: 0.5,   // 차지 중 이동 속도 배율
  dashCooldown: 2,   // 대시 쿨타임(초)
};

export const RULES = {
  maxAmmo: 3,
  startAmmo: 1,
  hp: 3,
  roundsToWin: 2,
  wallHp: 2,
  gravity: 22,
  throwHeight: 1.3,
  throwCooldown: 0.5, // 던진 뒤 다음 차지까지 쉬는 시간(초), 광클 방지
  dashSpeed: 15,
  dashTime: 0.18,
  respawnTime: 3,     // 2대2 부활 대기(초)
  invulnTime: 1.5,    // 부활 직후 무적(초)
  countdown: 2.7,
  roundEndTime: 3.2,
  tickRate: 30,
  // 아이템: 얼음돌
  stoneSpeed: 28,     // 직선으로 날아가는 속도(m/s)
  stoneRange: 22,     // 사거리(m)
  stoneHeight: 0.95,  // 날아가는 높이(m), 눈벽(1.1m)에 막힌다
  stonesPerPick: 2,   // 한 번 주우면 몇 발
  itemFirst: 6,       // 라운드 시작 후 첫 아이템까지(초)
  itemEvery: 10,      // 그다음부터 간격(초)
  itemFall: 1.2,      // 떨어지는 시간(초), 이동안 바닥에 표시
  itemLife: 15,       // 안 주우면 사라지기까지(초)
  itemMax: 2,         // 동시에 깔려 있을 수 있는 수
};

// 눈벽과 출발 위치는 빨강팀(아래쪽, z > 0) 기준. 파랑팀은 z를 뒤집어 대칭으로 둔다.
export const MODES = {
  '1v1': {
    label: '1대1', teamSize: 1, killsToWin: 1, respawn: false,
    w: 30, d: 20,
    walls: [[-8, 4], [8, 4], [0, 2.6]],
    spawns: [[0, 7]],
    cam: { y: 24, z: 21 },
  },
  '2v2': {
    label: '2대2', teamSize: 2, killsToWin: 5, respawn: true,
    w: 36, d: 22,
    walls: [[-11.5, 4.6], [11.5, 4.6], [-4.5, 2.8], [4.5, 2.8], [0, 6.4]],
    spawns: [[-3.6, 9.2], [3.6, 9.2]],
    cam: { y: 29, z: 25.5 },
  },
};

export const TEAM_NAMES = ['빨강팀', '파랑팀'];
