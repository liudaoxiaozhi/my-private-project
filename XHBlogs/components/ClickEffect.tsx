"use client";
import { useEffect, useRef } from 'react';

export default function ClickEffect() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 只需要这三个成员；具体实现见下方 Ripple 类
    const ripples: Array<{ opacity: number; update: () => void; draw: () => void }> = [];
    let frameId = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    class Ripple {
      x: number; y: number;
      r: number;        // 半径
      maxR: number;     // 最大半径
      opacity: number;  // 透明度
      velocity: number; // 扩散速度

      constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
        this.r = 0;
        this.maxR = 60;   // 涟漪扩散的大小，60 比较克制
        this.opacity = 0.6;
        this.velocity = 2.5;
      }

      update() {
        this.r += this.velocity;
        // 随着半径变大，扩散速度减慢（物理模拟）
        this.velocity *= 0.96;
        // 透明度线性衰减
        this.opacity -= 0.015;
      }

      draw() {
        if (!ctx) return;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        // 使用你主题里的靛蓝色，并带上动态透明度
        ctx.strokeStyle = `rgba(129, 140, 248, ${this.opacity})`;
        ctx.lineWidth = 2;
        ctx.stroke();

        // 内部再加一个极淡的实心圆，增加“触碰感”
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(129, 140, 248, ${this.opacity * 0.3})`;
        ctx.fill();
      }
    }

    const handleClick = (e: MouseEvent) => {
      ripples.push(new Ripple(e.clientX, e.clientY));
      // 🚀 只有存在涟漪时才运行动画循环；旧版即使没人点击也每帧清空重绘整张全屏画布
      if (!frameId) frameId = requestAnimationFrame(animate);
    };

    window.addEventListener('click', handleClick);

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 增加全局模糊，让涟漪更有“云端”质感
      ctx.shadowBlur = 15;
      ctx.shadowColor = 'rgba(129, 140, 248, 0.5)';

      for (let i = 0; i < ripples.length; i++) {
        ripples[i].update();
        ripples[i].draw();
        if (ripples[i].opacity <= 0) {
          ripples.splice(i, 1);
          i--;
        }
      }
      // 涟漪全部消失后停下循环，等下一次点击再启动
      frameId = ripples.length > 0 ? requestAnimationFrame(animate) : 0;
    };

    return () => {
      // 修复：卸载时停止动画循环（旧版没有取消，组件卸载后仍在每帧空转）
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('click', handleClick);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[9999]"
    />
  );
}