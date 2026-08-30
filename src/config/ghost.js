export const GHOST_CONFIG = {
  hpMax: 100,
  stages: [
    { id: 'calm', label: '冷静', min: 0, max: 24, speed: 1.35, viewDist: 6, cone: 90 },
    { id: 'annoyed', label: '不悦', min: 25, max: 49, speed: 1.8, viewDist: 12, cone: 150 },
    { id: 'angry', label: '愤怒', min: 50, max: 74, speed: 2.6, viewDist: 15, cone: 160 },
    { id: 'furious', label: '暴怒', min: 75, max: 94, speed: 3.4, viewDist: 999, cone: 360 },
    { id: 'insane', label: '狂乱', min: 95, max: 100, speed: 4.8, viewDist: 9999, cone: 360 }
  ],
  finalChaseSpeed: 5.2,
  speech: {
    calm: ['哈啊……', '今天也安静点吧。', '别出声……'],
    annoyed: ['谁在那里？', '又来了？！', '脚步声好吵。'],
    angry: ['抓到你了！', '别跑！', '这位同学，你作业交了吗？'],
    furious: ['吵死了吵死了！！', '我要生气了！！', '不准再动了！'],
    insane: ['啊啊啊啊——！', '全都给我安静！！', '咩————！！']
  },
  rage: {
    hit: 9,
    glue: 4,
    wrongSeal: 30,
    noise: 5,
    break: 12,
    sprintNear: 0.5,
    slap: 8,
    clueRead: 4,
    quiet: 1.5,
    hide: 8
  }
};

export function stageForRage(rage) {
  const clamped = Math.max(0, Math.min(100, rage));
  return GHOST_CONFIG.stages.find(s => clamped >= s.min && clamped <= s.max) || GHOST_CONFIG.stages[0];
}
