// lib/comicMotion.ts —— 分镜墙（漫画格子）动效：入场分镜依次浮现、点开格子时斜线劈开
//
// Technique adapted from Yuimi-chaya/Yuimi-chaya.github.io (MIT):
//   - IntersectionObserver 布防 + WAAPI 分级入场（整页上浮淡入 → 格子错峰 → 旁白框跟上）
//   - 动画结束时先把最终状态写进行内样式，再 animation.cancel()，不留 fill 动画占着合成层
//   - 切走标签页 / 改窗口大小时立刻收尾；滚出视口后重新布防，滚回来再播一遍
//   - 斜线分割：两半各用 clip-path 裁成梯形，向两侧滑开
// 这里是独立实现，没有使用该仓库的任何图片、SVG 或字体。
//
// 不依赖 React：ComicWall 在 useEffect 里调用 armComicReveal()，返回的函数就是清理函数。
// 内容永远不会在服务端 HTML 里被隐藏：只有 JS 跑起来、确认要播动画时才在根节点写 data-comic-armed，
// 样式表据此把它设为透明（见 app/anime/comic.css）。

export type ComicLevel = 'full' | 'lite' | 'off';

export interface ComicPlayOptions {
  duration: number;
  delay?: number;
  easing?: string;
}

export interface ComicMotion {
  /** 播放一段 WAAPI 动画；结束后把最后一帧写成行内样式。被 cancelAll() 打断时也会 resolve */
  play(node: HTMLElement | null | undefined, keyframes: Keyframe[], opts: ComicPlayOptions): Promise<void>;
  /** 所有进行中的动画直接跳到结尾（切走标签页、改窗口大小时用） */
  finishAll(): void;
  /** 取消所有动画，并把 play() 碰过的行内样式还原成播放前的样子 */
  cancelAll(): void;
}

const EASE_OUT = 'cubic-bezier(.23,1,.32,1)';
const NON_STYLE_KEYS = new Set(['offset', 'easing', 'composite']);

const toCssProperty = (key: string) => key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

function styleEntries(frame: Keyframe): Array<[string, string]> {
  return Object.entries(frame)
    .filter(([key, value]) => !NON_STYLE_KEYS.has(key) && value !== undefined && value !== null)
    .map(([key, value]) => [toCssProperty(key), String(value)]);
}

export function createComicMotion(): ComicMotion {
  /** 进行中的动画 → 让 play() 返回的 Promise 结束 */
  const running = new Map<Animation, () => void>();
  /** 每个节点第一次被 play() 时的行内样式，cancelAll() 时还原 */
  const original = new Map<HTMLElement, Map<string, string>>();

  const remember = (node: HTMLElement, props: string[]) => {
    let saved = original.get(node);
    if (!saved) {
      saved = new Map();
      original.set(node, saved);
    }
    for (const prop of props) if (!saved.has(prop)) saved.set(prop, node.style.getPropertyValue(prop));
  };

  const settle = (node: HTMLElement, entries: Array<[string, string]>) => {
    for (const [prop, value] of entries) node.style.setProperty(prop, value);
  };

  return {
    play(node, keyframes, { duration, delay = 0, easing = EASE_OUT }) {
      if (!node || keyframes.length === 0) return Promise.resolve();
      const finalEntries = styleEntries(keyframes[keyframes.length - 1]);
      remember(
        node,
        finalEntries.map(([prop]) => prop),
      );
      // 不支持 WAAPI，或页面在后台（动画不会推进）：直接落到最终状态
      if (typeof node.animate !== 'function' || document.hidden) {
        settle(node, finalEntries);
        return Promise.resolve();
      }
      const animation = node.animate(keyframes, { duration, delay, easing, fill: 'both' });
      return new Promise<void>((resolve) => {
        running.set(animation, resolve);
        animation.finished.then(
          () => {
            // 期间被 cancelAll() 取消过：什么都不写
            if (!running.has(animation)) return;
            running.delete(animation);
            settle(node, finalEntries);
            animation.cancel();
            resolve();
          },
          () => {
            running.delete(animation);
            resolve();
          },
        );
      });
    },

    finishAll() {
      for (const animation of [...running.keys()]) {
        try {
          animation.finish();
        } catch {
          /* 已经被取消的动画无需收尾 */
        }
      }
    },

    cancelAll() {
      for (const [animation, resolve] of [...running]) {
        running.delete(animation);
        animation.cancel();
        resolve();
      }
      for (const [node, saved] of original) {
        for (const [prop, value] of saved) {
          if (value) node.style.setProperty(prop, value);
          else node.style.removeProperty(prop);
        }
      }
      original.clear();
    },
  };
}

// —— 入场：整页上浮淡入，格子错峰浮起，旁白框随后淡入 ——

const PAGE_IN: Keyframe[] = [
  { opacity: 0, transform: 'translate3d(0,18px,0)' },
  { opacity: 1, transform: 'translate3d(0,0,0)' },
];
const PANEL_IN: Keyframe[] = [
  { opacity: 0, transform: 'translate3d(0,8px,0)' },
  { opacity: 1, transform: 'translate3d(0,0,0)' },
];
const CAPTION_IN: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];

/** 错峰最多排到第几格：格子再多也不会让最后一格等太久（16 × 25ms = 400ms） */
const MAX_STAGGER_INDEX = 16;
/** 进入视口判定：IntersectionObserver 的触发点（细分一些，超高的分镜墙也能在露出 20% 视口时触发） */
const THRESHOLDS = Array.from({ length: 11 }, (_, i) => i / 50);

export interface ComicRevealOptions {
  panelSelector: string;
  captionSelector: string;
  level: ComicLevel;
  /** 露出多少才开播：自身面积的比例，或视口高度的比例，满足其一即可。默认 0.2 */
  threshold?: number;
}

/**
 * 给分镜墙布防入场动画，返回清理函数。
 * - off（含系统「减少动态效果」）：什么都不做，内容一直可见
 * - lite：只有整页上浮淡入
 * - full：整页 + 格子错峰（25ms 间隔、220ms、上浮 8px）+ 旁白框（比所在格子晚 80ms）
 * 完全滚出视口后重新布防，滚回来再播一次。
 */
export function armComicReveal(root: HTMLElement, { panelSelector, captionSelector, level, threshold = 0.2 }: ComicRevealOptions): () => void {
  if (level === 'off') return () => {};
  if (typeof IntersectionObserver === 'undefined' || typeof root.animate !== 'function') return () => {};
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return () => {};

  const motion = createComicMotion();
  let entered = false;

  const arm = () => {
    root.dataset.comicArmed = level;
  };
  const disarm = () => {
    delete root.dataset.comicArmed;
  };

  const reset = () => {
    motion.cancelAll();
    entered = false;
    arm();
  };

  const enter = () => {
    if (entered) return;
    entered = true;
    // 下面的动画都是 fill: both，撤掉布防和开播在同一帧里，不会闪一下
    disarm();
    void motion.play(root, PAGE_IN, { duration: 320 });
    if (level !== 'full') return;
    root.querySelectorAll<HTMLElement>(panelSelector).forEach((panel, index) => {
      const delay = Math.min(index, MAX_STAGGER_INDEX) * 25;
      void motion.play(panel, PANEL_IN, { duration: 220, delay });
      // 旁白框跟在自己的格子后面 80ms，并在格子内部再错开 15ms（一格里可能有多个旁白）
      panel.querySelectorAll<HTMLElement>(captionSelector).forEach((caption, inner) => {
        void motion.play(caption, CAPTION_IN, { duration: 160, delay: delay + 80 + inner * 15 });
      });
    });
  };

  const observer = new IntersectionObserver(
    (records) => {
      for (const record of records) {
        if (!record.isIntersecting) {
          // 完全离开视口：重新布防，下次滚回来再播
          reset();
          continue;
        }
        const viewport = record.rootBounds?.height ?? window.innerHeight;
        if (record.intersectionRatio >= threshold || record.intersectionRect.height >= viewport * threshold) enter();
      }
    },
    { threshold: THRESHOLDS },
  );

  const onVisibility = () => {
    if (document.hidden) motion.finishAll();
  };
  const onResize = () => motion.finishAll();

  arm();
  observer.observe(root);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('resize', onResize);

  return () => {
    observer.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('resize', onResize);
    motion.cancelAll();
    disarm();
  };
}

// —— 点开格子：沿斜线劈成两半向两侧滑开 ——

const SPLIT_LEFT = 'polygon(0 0,66% 0,40% 100%,0 100%)';
const SPLIT_RIGHT = 'polygon(66% 0,100% 0,100% 100%,40% 100%)';

/**
 * 把 face 复制成两半盖在 host 上，沿斜线向两侧滑开（约 280ms），动画结束后 resolve。
 * 返回的函数撤掉两半、让原画面淡回来；调用方一般在打开详情之后再调用它。
 * host 在动画期间带 is-splitting 类，样式表可以给露出来的底色加效果线。
 */
export async function playComicSplit(host: HTMLElement, face: HTMLElement, duration = 280): Promise<() => void> {
  const motion = createComicMotion();
  const overlay = document.createElement('div');
  overlay.className = 'comic-split';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.style.cssText = 'position:absolute;inset:0;z-index:5;pointer-events:none;';

  const halves = [SPLIT_LEFT, SPLIT_RIGHT].map((clip) => {
    const half = document.createElement('div');
    half.style.cssText = `position:absolute;inset:0;clip-path:${clip};`;
    const clone = face.cloneNode(true) as HTMLElement;
    // 克隆出来的节点不能和原节点重复 id（aria-describedby 等）
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
    half.appendChild(clone);
    overlay.appendChild(half);
    return half;
  });

  const faceVisibility = face.style.visibility;
  host.appendChild(overlay);
  host.classList.add('is-splitting');
  face.style.visibility = 'hidden';

  const easing = 'cubic-bezier(.65,0,.35,1)';
  await Promise.all([
    motion.play(halves[0], [{ transform: 'translate3d(0,0,0)' }, { transform: 'translate3d(-105%,0,0) rotate(-2deg)' }], { duration, easing }),
    motion.play(halves[1], [{ transform: 'translate3d(0,0,0)' }, { transform: 'translate3d(105%,0,0) rotate(2deg)' }], { duration, easing }),
  ]);

  return () => {
    motion.cancelAll();
    overlay.remove();
    host.classList.remove('is-splitting');
    face.style.visibility = faceVisibility;
    if (face.isConnected && typeof face.animate === 'function') {
      face.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: EASE_OUT });
    }
  };
}
