// components/PanelSeam.tsx —— 首页各区块之间的漫画分格「缝」：一条强调色斜带 + 一条细墨线
// 纯装饰（aria-hidden、不接收点击），服务端组件；样式与滚动驱动动画都在 panel-seam.css 里。
// Technique adapted from Yuimi-chaya/Yuimi-chaya.github.io (MIT).
import './panel-seam.css';

type PanelSeamProps = {
  /** 镜像斜向：默认左低右高，flip 后左高右低 */
  flip?: boolean;
  className?: string;
};

export default function PanelSeam({ flip = false, className }: PanelSeamProps) {
  const classes = ['panel-seam', flip ? 'panel-seam--flip' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <div aria-hidden="true" className={classes}>
      <span className="panel-seam__ribbon" />
      <span className="panel-seam__line" />
    </div>
  );
}
