"use client";
// app/global-error.tsx —— 根布局本身出错时的最后兜底。
// 此时根布局（样式、字体、导航栏）都不可用，所以自带 <html>/<body> 和内联样式，保持极简。

interface GlobalErrorProps {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}

export default function GlobalError({ error, unstable_retry }: GlobalErrorProps) {
  return (
    <html lang="zh-CN">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #e0e7ff, #fce7f3)',
          fontFamily: 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
          color: '#1e293b',
        }}
      >
        <title>出错了</title>
        <main style={{ textAlign: 'center', padding: '2rem' }}>
          <h1 style={{ fontSize: '1.5rem', margin: 0 }}>网站暂时出了点问题</h1>
          <p style={{ color: '#64748b', marginTop: '0.75rem' }}>可以稍后刷新再试。</p>
          <button
            type="button"
            onClick={() => unstable_retry()}
            style={{
              marginTop: '1.5rem',
              padding: '0.6rem 1.6rem',
              border: 0,
              borderRadius: 999,
              background: '#6366f1',
              color: '#fff',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            重试
          </button>
          {error.digest && <p style={{ marginTop: '1.5rem', fontSize: 12, color: '#94a3b8' }}>错误编号：{error.digest}</p>}
        </main>
      </body>
    </html>
  );
}
