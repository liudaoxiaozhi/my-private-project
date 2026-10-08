// components/SakuraBranches.tsx —— 左上、右上两枝樱花，从屏幕边缘伸进画面（只在电脑端显示）
//
// 放在背景里、毛玻璃卡片后面，透过卡片若隐若现。故意做成静止的：背景里只要有东西在动，
// 所有毛玻璃每一帧都要重新计算模糊（全站卡顿的主要来源），静止的枝条只算一次。
// 「动」交给前景的飘落花瓣（components/Sakura.tsx）。

interface Bloom {
  x: number;
  y: number;
  /** 大小（1 = 直径约 40） */
  s: number;
  /** 旋转角度 */
  r: number;
  /** 花苞：只画一个小圆 */
  bud?: boolean;
}

// 枝条（坐标在 460 × 320 的画布里，从左边缘伸进来）
const MAIN = 'M-10 40 C 80 30, 150 60, 230 95 S 360 150, 440 178';
const TWIGS = [
  'M150 68 C 165 42, 190 28, 222 22',
  'M232 96 C 242 128, 238 158, 224 188',
  'M300 124 C 326 102, 352 92, 384 90',
  'M362 154 C 372 186, 366 212, 352 236',
  'M82 40 C 88 70, 80 96, 66 120',
  'M260 108 C 276 92, 284 74, 286 56',
];

const BLOOMS: Bloom[] = [
  { x: 222, y: 22, s: 1, r: 10 },
  { x: 200, y: 36, s: 0.75, r: 40 },
  { x: 286, y: 54, s: 0.85, r: -15 },
  { x: 224, y: 190, s: 1, r: 25 },
  { x: 238, y: 160, s: 0.7, r: -30 },
  { x: 384, y: 90, s: 1.05, r: 5 },
  { x: 356, y: 98, s: 0.7, r: 50 },
  { x: 352, y: 238, s: 0.95, r: -10 },
  { x: 368, y: 206, s: 0.65, r: 30 },
  { x: 66, y: 122, s: 0.9, r: 15 },
  { x: 84, y: 92, s: 0.65, r: -40 },
  { x: 440, y: 178, s: 0.9, r: 20 },
  { x: 414, y: 166, s: 0.6, r: -20 },
  { x: 300, y: 124, s: 0.7, r: 60 },
  { x: 150, y: 66, s: 0.75, r: -5 },
  { x: 120, y: 50, s: 0.6, r: 35 },
  { x: 178, y: 30, s: 0.35, r: 0, bud: true },
  { x: 250, y: 140, s: 0.35, r: 0, bud: true },
  { x: 330, y: 96, s: 0.3, r: 0, bud: true },
  { x: 358, y: 180, s: 0.35, r: 0, bud: true },
  { x: 74, y: 66, s: 0.3, r: 0, bud: true },
  { x: 278, y: 82, s: 0.3, r: 0, bud: true },
];

// 一片花瓣：从花心 (20,20) 向上长，顶端带樱花特有的小缺口
const PETAL = 'M20 20 C 13.5 15, 12 7, 16.5 3.2 L 20 6.2 L 23.5 3.2 C 28 7, 26.5 15, 20 20 Z';

function Branch({ id, mirror }: { id: string; mirror?: boolean }) {
  return (
    <svg
      viewBox="0 0 460 320"
      className={`sakura-branch ${mirror ? 'sakura-branch-right' : 'sakura-branch-left'}`}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={`${id}-petal`} cx="50%" cy="85%" r="80%">
          <stop offset="0%" stopColor="#f48fb1" />
          <stop offset="45%" stopColor="#ffc1d6" />
          <stop offset="100%" stopColor="#fff3f7" />
        </radialGradient>
        <g id={`${id}-bloom`}>
          {[0, 72, 144, 216, 288].map((deg) => (
            <path key={deg} d={PETAL} transform={`rotate(${deg} 20 20)`} fill={`url(#${id}-petal)`} />
          ))}
          <circle cx="20" cy="20" r="2.6" fill="#e0607e" />
          {[0, 60, 120, 180, 240, 300].map((deg) => (
            <circle key={deg} cx="20" cy="15.2" r="0.9" fill="#ffd166" transform={`rotate(${deg} 20 20)`} />
          ))}
        </g>
      </defs>
      <g className="sakura-branch-wood" fill="none" strokeLinecap="round">
        <path d={MAIN} strokeWidth="9" />
        <path d={MAIN} strokeWidth="5" transform="translate(0 2)" opacity="0.5" />
        {TWIGS.map((d) => (
          <path key={d} d={d} strokeWidth="3.2" />
        ))}
      </g>
      {BLOOMS.map((b, i) =>
        b.bud ? (
          <circle key={i} cx={b.x} cy={b.y} r={b.s * 10} fill="#f48fb1" />
        ) : (
          <use key={i} href={`#${id}-bloom`} transform={`translate(${b.x - 20 * b.s} ${b.y - 20 * b.s}) scale(${b.s}) rotate(${b.r} 20 20)`} />
        ),
      )}
    </svg>
  );
}

export default function SakuraBranches() {
  return (
    <div className="sakura-branches" aria-hidden="true">
      <Branch id="sb-l" />
      <Branch id="sb-r" mirror />
    </div>
  );
}
