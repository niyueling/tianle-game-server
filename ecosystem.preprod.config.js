// 线上测试服配置
module.exports = {
  apps: [
    {
      name: "tianle-game-server",
      script: "dist/server.js",
      env: {
        COMMON_VARIABLE: "true",
        NODE_ENV: "preprod",
      },
      env_production: {
        NODE_ENV: "production"
      },
      log_date_format: "YYYY-MM-DD HH:mm Z"
    },
    {
      name: "tianle-majiang-server",
      script: "dist/backend.majiang.js",
      instances: 1,
      instance_var: 'INSTANCE_ID',
      env: {
        COMMON_VARIABLE: "true",
        NODE_ENV: "preprod",
      },
      env_production: {
        NODE_ENV: "production"
      },
      log_date_format: "YYYY-MM-DD HH:mm Z"
    }
  ]
}
