// 生产服配置
module.exports = {
  apps: [
    {
      name: "game-server",
      script: "dist/server.js",
      env: {
        COMMON_VARIABLE: "true",
        NODE_ENV: "production",
      },
      env_production: {
        NODE_ENV: "production",
      }
	  ,log_date_format: "YYYY-MM-DD HH:mm Z"
    },
    {
      name: "backend.majiang",
      script: "dist/backend.majiang.js",
      instances: 1,
      instance_var: 'INSTANCE_ID',
      env: {
        COMMON_VARIABLE: "true",
        NODE_ENV: "production",
      },
      env_production: {
        NODE_ENV: "production"
      }
	  ,log_date_format: "YYYY-MM-DD HH:mm Z"
    }
  ]
}
