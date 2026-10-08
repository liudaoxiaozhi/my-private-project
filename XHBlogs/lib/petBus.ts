// lib/petBus.ts —— 站内其他组件给桌宠发指令（工具箱的「召回桌宠」、御神签让她念签文等）
//
// 用 window 事件传递，桌宠没挂载（手机端、阅读页、siteConfig.enablePet 关闭）时指令自然没人接，不会报错。

export type PetCommand =
  | { type: 'recall' }
  | { type: 'say'; text: string; ms?: number };

export const PET_COMMAND_EVENT = 'pet-command';

export function sendPetCommand(command: PetCommand): void {
  window.dispatchEvent(new CustomEvent<PetCommand>(PET_COMMAND_EVENT, { detail: command }));
}
