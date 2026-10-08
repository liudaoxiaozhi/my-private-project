// data/omikuji.ts —— 今日御神签的签文（工具箱 → 🎋 御神签）
//
// 想改签文直接改这里：每一档有自己的签诗和 Saber 的评语，各分项按「好 / 平 / 差」三种语气随机组合。

export type OmikujiTone = 'good' | 'fair' | 'bad';

export interface OmikujiLevel {
  name: string;
  /** 抽中的相对概率 */
  weight: number;
  tone: OmikujiTone;
  /** 签面主色（Tailwind 类） */
  color: string;
  /** 两句签诗，随机取一组 */
  verses: Array<[string, string]>;
  /** Saber 念完签之后说的话（桌宠气泡里也会说） */
  comments: string[];
}

export const OMIKUJI_LEVELS: OmikujiLevel[] = [
  {
    name: '大吉',
    weight: 14,
    tone: 'good',
    color: 'text-rose-500',
    verses: [
      ['春风十里樱满枝', '所求之事皆可期'],
      ['长剑在手星在天', '一路前行无阻拦'],
    ],
    comments: ['大吉！Master，今天无论做什么都会顺利的。', '是大吉。……我也替你高兴，今天就放手去做吧。'],
  },
  {
    name: '中吉',
    weight: 20,
    tone: 'good',
    color: 'text-pink-500',
    verses: [
      ['云开月出照书窗', '勤者自有好文章'],
      ['小舟轻过万重山', '回头已是艳阳天'],
    ],
    comments: ['中吉，运势很不错。保持现在的节奏就好。', '中吉。看来今天适合把想做的事推进一步。'],
  },
  {
    name: '小吉',
    weight: 20,
    tone: 'fair',
    color: 'text-violet-500',
    verses: [
      ['细雨无声润新芽', '一点一滴见繁花'],
      ['灯下翻书夜未央', '小小欢喜在身旁'],
    ],
    comments: ['小吉。平稳的一天也很好，不是吗？', '小吉。留意身边的小事，会有惊喜的。'],
  },
  {
    name: '吉',
    weight: 18,
    tone: 'fair',
    color: 'text-indigo-500',
    verses: [
      ['行至水穷处', '坐看云起时'],
      ['一曲清音伴晚风', '心安之处即归程'],
    ],
    comments: ['吉。没有坏事，就是最好的事。', '是吉。今天就按自己的步调来吧，Master。'],
  },
  {
    name: '末吉',
    weight: 16,
    tone: 'fair',
    color: 'text-sky-500',
    verses: [
      ['花开虽晚终会开', '耐心等候好运来'],
      ['今日播下一粒种', '他日方知用心浓'],
    ],
    comments: ['末吉。好运在后头，现在先打好基础。', '末吉……不必在意，后劲最足的往往是末吉。'],
  },
  {
    name: '凶',
    weight: 10,
    tone: 'bad',
    color: 'text-slate-500',
    verses: [
      ['阴云暂掩月光明', '静待风来天自晴'],
      ['路滑且行且小心', '退一步也是前进'],
    ],
    comments: ['是凶……别担心，我会守着你的。把签系在樱花枝上吧。', '凶签而已，骑士不会被这种东西打倒。Master 也一样。'],
  },
  {
    name: '大凶',
    weight: 2,
    tone: 'bad',
    color: 'text-slate-700 dark:text-slate-300',
    verses: [
      ['物极必反否极泰', '最坏之日已过去'],
      ['大凶难得一回见', '明日必定转晴天'],
    ],
    comments: ['大、大凶？！……这么稀有的签，某种意义上也是好运吧。', '大凶。没关系，有我在。今天就吃顿好的，早点睡。'],
  },
];

export const OMIKUJI_CATEGORIES = ['学业', '恋爱', '健康', '愿望'] as const;

export const OMIKUJI_LINES: Record<(typeof OMIKUJI_CATEGORIES)[number], Record<OmikujiTone, string[]>> = {
  学业: {
    good: ['灵感不断，适合攻克难题', '写下的东西会被更多人看到', '今天学的会记得特别牢'],
    fair: ['按部就班即可', '先复习再学新的', '整理笔记会有收获'],
    bad: ['容易分心，先关掉手机', '别贪多，一次只做一件事', '今天适合打基础，不宜冒进'],
  },
  恋爱: {
    good: ['主动开口会有好结果', '缘分就在身边，留意一下', '一句真心话胜过千言'],
    fair: ['顺其自然就好', '多听少说，对方会感受到', '一起听首歌吧'],
    bad: ['今天少说气话', '误会需要耐心解开', '先照顾好自己的心情'],
  },
  健康: {
    good: ['精神饱满，适合运动', '胃口很好，多吃一点', '早睡早起效果翻倍'],
    fair: ['记得多喝水', '坐久了起来走走', '眼睛累了就看看远处'],
    bad: ['今晚不许熬夜', '注意保暖', '少喝点咖啡'],
  },
  愿望: {
    good: ['会比预想的更早实现', '有贵人相助', '想做的事，今天就动手'],
    fair: ['需要一点时间，但方向是对的', '先完成一小步', '写下来，它就离你更近'],
    bad: ['暂时搁置，不必强求', '换个方法会更顺', '先休息，再出发'],
  },
};

export const OMIKUJI_DO = ['写博客', '整理书架', '听纯音乐', '早睡', '追一集新番', '出门散步', '给朋友发消息', '读一本旧书', '吃汉堡'];
export const OMIKUJI_DONT = ['熬夜', '拖延', '空腹喝咖啡', '在评论区吵架', '乱买东西', '久坐不动', '刷手机到深夜', '跳过早饭'];
export const OMIKUJI_LUCKY_ITEMS = ['樱花书签', '热可可', '耳机', '汉堡', '旧书', '猫咪贴纸', '一杯白开水', '手写便签', '暖色的灯'];
export const OMIKUJI_LUCKY_COLORS = ['樱花粉', '天空蓝', '薄荷绿', '奶油白', '星空紫', '琥珀橙'];
