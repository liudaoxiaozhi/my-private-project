"use client";
// components/toolbox/PetTool.tsx —— 工具箱里的「召回桌宠」：被拖到角落找不到、或者收起了，一键叫她回到默认位置

import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { siteConfig } from '../../siteConfig';
import { sendPetCommand } from '../../lib/petBus';

export default function PetTool() {
  const [recalled, setRecalled] = useState(false);

  if (!siteConfig.enablePet) {
    return <p className="py-6 text-center text-xs text-slate-400">桌宠已在 siteConfig 里关闭（enablePet）</p>;
  }

  return (
    <div className="flex flex-col items-center gap-3 py-2 text-center">
      <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        把她拖到角落找不到了，或者收起后想叫她出来？
      </p>
      <button
        type="button"
        onClick={() => {
          sendPetCommand({ type: 'recall' });
          setRecalled(true);
          window.setTimeout(() => setRecalled(false), 2500);
        }}
        className="flex w-full items-center justify-center gap-1.5 rounded-full bg-indigo-500 py-2 text-sm font-bold text-white shadow-md transition-colors hover:bg-indigo-600"
      >
        <MapPin size={15} /> {recalled ? '她回来啦' : '召回桌宠'}
      </button>
      <p className="text-[10px] text-slate-400">会回到右下角的默认位置，并重新探出头来</p>
    </div>
  );
}
