module.exports = {
  apps: [
    {
      name: "profitability-api",
      cwd: "./apps/api",
      script: "dist/main.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "profitability-web",
      cwd: "./apps/web",
      script: "pnpm",
      args: "exec vite preview --host 0.0.0.0 --port 4100",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
