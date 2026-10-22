// lib/petBus.ts —— 站内其他组件给桌宠发指令（工具箱的「召回桌宠」、御神签让她念签文等）
//
// 用 window 事件传递，桌宠没挂载（手机端、阅读页、siteConfig.enablePet 关闭）时指令自然没人接，不会报错。
// 桌宠是页面空闲后才加载的（components/LazyFx.tsx）：她第一次挂载之前发出的指令先记下最近几条，
// 挂载时补上（比如一打开页面就按出的秘籍）；太久以前的不补，挂载过一次之后就不再记。

export type PetCommand =
  | { type: 'recall' }
  | { type: 'say'; text: string; ms?: number };

export const PET_COMMAND_EVENT = 'pet-command';

const MISSED_LIMIT = 5;
const MISSED_TTL = 10_000;
let missed: { command: PetCommand; at: number }[] | null = [];

export function sendPetCommand(command: PetCommand): void {
  if (missed) missed = [...missed.slice(1 - MISSED_LIMIT), { command, at: Date.now() }];
  window.dispatchEvent(new CustomEvent<PetCommand>(PET_COMMAND_EVENT, { detail: command }));
}

/** 桌宠挂载时调用：取出她第一次挂载前没人接的指令（之后再调用都是空的） */
export function takeMissedPetCommands(): PetCommand[] {
  const now = Date.now();
  const list = (missed ?? []).filter((m) => now - m.at < MISSED_TTL).map((m) => m.command);
  missed = null;
  return list;
}

/** 撒一小把花瓣庆祝（读完文章等），由 components/EasterEggs.tsx 负责画；「阅读」档不撒 */
export const PETAL_BURST_EVENT = 'petal-burst';

export function petalBurst(): void {
  window.dispatchEvent(new Event(PETAL_BURST_EVENT));
}
