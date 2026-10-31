/**
 * 共享层：场地常量、几何、类型、双方规则。
 * client 与 server 引用同一份，保证「同一套初始条件 → 同一条轨迹」。
 */

/** 逻辑画布尺寸。两侧赛道各占一半，坐标完全一致。 */
export const FIELD = {
  width: 480,
  height: 960,
  /** 通道净空宽度（两侧内壁之间） */
  channelWidth: 372,
  /** 顶部挡板高度：球往上最多弹到这条线 */
  launcherHeight: 68,
} as const;

export const PHYSICS = {
  /** 球半径。球与球之间按这个半径做真实碰撞 */
  ballRadius: 5,
  /**
   * 球与球碰撞的弹性系数。必须是 1（完全弹性）：
   * 0.9 时几百颗球互相碰着碰着就把动能耗光，全堆在玻璃上不再上下弹。
   */
  ballRestitution: 1,
  /** 落到玻璃上时竖直速度低于这个值不算一次撞击（防止被挤压的球每帧都「蹭」出伤害） */
  minHitSpeed: 80,
} as const;

/**
 * 两侧的成长规则（默认值）。实际数值以 EngineConfig.redMultiplier / blueAdd 为准。
 *   RED  ×2    每破一块玻璃，场上球数翻倍
 *   BLUE +15   每破一块玻璃，场上球数加 15
 */
export type ModifierId = 'R2' | 'B15';
export type Team = ModifierId;

export interface Modifier {
  id: ModifierId;
  label: string;
  short: string;
  desc: string;
}

export const MODIFIERS: Record<ModifierId, Modifier> = {
  R2: { id: 'R2', label: 'RED', short: '×2', desc: '每破一块，球数翻倍' },
  B15: { id: 'B15', label: 'BLUE', short: '+15', desc: '每破一块，球数加 15' },
};

export interface Brick {
  id: number;
  /** 0 = 最上面一块 */
  tier: number;
  /** 面板上显示的数值，同时也是血量 */
  value: number;
  hp: number;
  maxHp: number;
}

/** 一次破镜：时间、层号、位置、破镜前后的球数 */
export interface BreakEvent {
  t: number;
  tier: number;
  x: number;
  y: number;
  ballsBefore: number;
  ballsAfter: number;
}

/** 一条赛道的结算（服务端和客户端都会算，必须逐位一致） */
export interface LaneResult {
  team: Team;
  breaks: number;
  /** 有效撞击总次数 */
  hits: number;
  /** 结束时的球数 */
  finalBalls: number;
  /** 每层被击碎的时刻，null = 未击碎 */
  tierTimes: (number | null)[];
  /** 每层的有效撞击次数 */
  tierHits: number[];
  /** 打穿整堆的时刻；没打穿则为时间上限 */
  totalTime: number;
  finished: boolean;
  outcome: 'allBroken' | 'timeout';
  /** 每秒一次的球数采样 */
  ballHistory: number[];
  breaksAt: BreakEvent[];
  /** 同一 tick 内发生的球-球碰撞总数（证明碰撞真的在算） */
  ballCollisions: number;
}

/** 回放帧的元数据；球坐标存在 Track.pos 里（offset 起 count 颗） */
export interface FrameMeta {
  t: number;
  balls: number;
  breaks: number;
  /** 当前最上面那块存活玻璃的剩余血量 */
  hp: number;
  offset: number;
  count: number;
}

/**
 * 一条赛道的完整录像：每帧记录**全部**在场球的坐标，不抽样。
 * 坐标量化为 1/32 像素存进 Uint16Array（x ≤ 480、y ≤ 960，乘 32 后不溢出）。
 * 只在浏览器里录（Web Worker 本地模拟），不走网络。
 */
export interface Track {
  frames: FrameMeta[];
  pos: Uint16Array;
}

export const POS_SCALE = 32;
