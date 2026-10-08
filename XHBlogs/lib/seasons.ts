// lib/seasons.ts —— 节日彩蛋：按读者本地日期决定今天飘什么（siteConfig.enableSeasonal 开关）
//
//   生日（siteConfig.birthday，"月-日"）：彩纸
//   春节（除夕前一天 ~ 初七）：红梅
//   圣诞（12/20 ~ 12/26）、元旦（12/31 ~ 1/2）：雪花
//   其余日子：樱花
// 节日当天桌宠还会送一句祝福（每个节日每年只说一次）。

export type Season = 'sakura' | 'snow' | 'plum' | 'confetti';

export interface SeasonInfo {
  season: Season;
  /** 当天的祝福语；不是需要祝福的日子则没有 */
  greeting?: string;
  /** 祝福只说一次：用它记录「今年这个节日已经说过了」 */
  greetingKey?: string;
}

/** 正月初一的公历日期（月-日） */
const SPRING_FESTIVAL: Record<number, string> = {
  2026: '02-17', 2027: '02-06', 2028: '01-26', 2029: '02-13', 2030: '02-03',
  2031: '01-23', 2032: '02-11', 2033: '01-31', 2034: '02-19', 2035: '02-08',
};

const DAY = 24 * 60 * 60 * 1000;

const mmdd = (d: Date): string => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** 与正月初一相差几天（只在附近两周内有意义）；查不到年份时返回 null */
function daysFromSpringFestival(d: Date): number | null {
  for (const year of [d.getFullYear(), d.getFullYear() + 1]) {
    const md = SPRING_FESTIVAL[year];
    if (!md) continue;
    const [m, day] = md.split('-').map(Number);
    const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(year, m - 1, day).getTime()) / DAY);
    if (Math.abs(diff) <= 14) return diff;
  }
  return null;
}

export function getSeason(date: Date, birthday?: string): SeasonInfo {
  const today = mmdd(date);
  const year = date.getFullYear();

  if (birthday && /^\d{2}-\d{2}$/.test(birthday) && today === birthday) {
    return { season: 'confetti', greeting: '生日快乐，Master！今天是属于你的日子。', greetingKey: `birthday-${year}` };
  }

  const sf = daysFromSpringFestival(date);
  if (sf !== null && sf >= -2 && sf <= 7) {
    if (sf === -1) return { season: 'plum', greeting: '今天是除夕。Master，一起守岁吧。', greetingKey: `spring-eve-${year}` };
    if (sf === 0) return { season: 'plum', greeting: '新春快乐，Master！今年也请多关照。', greetingKey: `spring-${year}` };
    return { season: 'plum' };
  }

  const month = date.getMonth() + 1;
  const day = date.getDate();
  if ((month === 12 && day === 31) || (month === 1 && day <= 2)) {
    return month === 1 && day === 1
      ? { season: 'snow', greeting: '新年快乐，Master！新的一年也会守护好这里。', greetingKey: `newyear-${year}` }
      : { season: 'snow' };
  }
  if (month === 12 && day >= 20 && day <= 26) {
    return day === 24 || day === 25
      ? { season: 'snow', greeting: '圣诞快乐，Master！今晚吃点好的吧。', greetingKey: `christmas-${year}` }
      : { season: 'snow' };
  }
  return { season: 'sakura' };
}
