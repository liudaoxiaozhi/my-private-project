"use client";
// components/Fireworks.tsx —— 全屏烟花（科乐美秘籍彩蛋用）：canvas 粒子，只在彩蛋期间运行，结束后自动停掉

import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

interface Rocket {
  x: number;
  y: number;
  vy: number;
  targetY: number;
  color: string;
}

const COLORS = ['#f472b6', '#fb7185', '#fbbf24', '#a78bfa', '#60a5fa', '#34d399', '#ffffff'];
const GRAVITY = 0.045;
const SPARKS = 70;

export default function Fireworks({ duration = 9000 }: { duration?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const rockets: Rocket[] = [];
    const sparks: Particle[] = [];
    const started = performance.now();
    let lastLaunch = 0;
    let frame = 0;

    const launch = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      rockets.push({
        x: w * (0.15 + Math.random() * 0.7),
        y: h,
        vy: -(h / 70) - Math.random() * 3,
        targetY: h * (0.15 + Math.random() * 0.3),
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      });
    };

    const explode = (r: Rocket) => {
      for (let i = 0; i < SPARKS; i++) {
        const angle = (Math.PI * 2 * i) / SPARKS + Math.random() * 0.2;
        const speed = 1.5 + Math.random() * 3.5;
        sparks.push({ x: r.x, y: r.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, color: Math.random() < 0.25 ? '#ffffff' : r.color });
      }
    };

    const tick = (now: number) => {
      const elapsed = now - started;
      if (elapsed < duration - 1500 && now - lastLaunch > 380) {
        launch();
        if (Math.random() < 0.4) launch();
        lastLaunch = now;
      }

      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      ctx.globalCompositeOperation = 'lighter';

      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.y += r.vy;
        r.vy *= 0.985;
        ctx.fillStyle = r.color;
        ctx.fillRect(r.x - 1.5, r.y, 3, 10);
        if (r.y <= r.targetY || r.vy > -1) {
          explode(r);
          rockets.splice(i, 1);
        }
      }

      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.x += s.vx;
        s.y += s.vy;
        s.vx *= 0.985;
        s.vy = s.vy * 0.985 + GRAVITY;
        s.life -= 0.012;
        if (s.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = s.life;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (elapsed < duration || sparks.length > 0) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, [duration]);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-[57] h-full w-full" />;
}
