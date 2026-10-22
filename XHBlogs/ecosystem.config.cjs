// ecosystem.config.cjs —— 自己的服务器上用 PM2 运行网站（步骤见 docs/DEPLOY-BAOTA.md）
//
//   pm2 start ecosystem.config.cjs    第一次启动
//   pm2 save && pm2 startup           开机自动启动
//   pm2 logs xhblogs                  看日志（也写在 logs/ 里）
//   pm2 reload xhblogs                重启（后台保存后自动重建完成时，scripts/self-host/rebuild.mjs 会执行这一步）
//
// 其余配置（ADMIN_PASSWORD 等）写在 .env.production.local 里，next start 启动时自己读取，这里不用重复。
const port = process.env.PORT || '3000';

module.exports = {
  apps: [
    {
      name: 'xhblogs',
      cwd: __dirname,
      script: 'node_modules/next/dist/bin/next',
      // 只监听本机：外面只能经过宝塔的 nginx 反向代理访问（TRUST_PROXY=1 才可信，见 lib/server/requestGuard.ts）
      args: `start -p ${port} -H 127.0.0.1`,
      // cluster 模式下 pm2 reload 先启动新进程、等它开始监听再停掉旧的，重建后切换版本时网站不会中断
      exec_mode: 'cluster',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        PORT: port,
      },
      // 新进程最多等 30 秒开始监听；旧进程收到停止信号后最多等 10 秒处理完手上的请求
      listen_timeout: 30_000,
      kill_timeout: 10_000,
      max_memory_restart: '1G',
      out_file: `${__dirname}/logs/out.log`,
      error_file: `${__dirname}/logs/error.log`,
      merge_logs: true,
      time: true,
    },
  ],
};
