// 内网测试服配置
module.exports = {
  apps: [
    {
      name: "wsserver",
      script: "dist/server.js",
      env: {
        COMMON_VARIABLE: "true",
        NODE_ENV: "stage"
      },
      env_production: {
        NODE_ENV: "production"
      },
      log_date_format: "YYYY-MM-DD HH:mm Z"
    },
    {
      name: "backend.biaofen",
      script: "dist/backend.biaofen.js",
      instances: 1,
      instance_var: 'INSTANCE_ID',
      env: {
        COMMON_VARIABLE: "true",
        NODE_ENV: "stage",
      },
      env_production: {
        NODE_ENV: "production"
      },
      log_date_format: "YYYY-MM-DD HH:mm Z"
    },
    {
      name: "backend.paodekuai",
      script: "dist/backend.paodekuai.js",
      // 只起一个进程
      instances: 1,
      instance_var: 'INSTANCE_ID',
      env: {
        COMMON_VARIABLE: "true",
        NODE_ENV: "stage",
      },
      env_production: {
        NODE_ENV: "production"
      },
      log_date_format: "YYYY-MM-DD HH:mm Z"
    },
    {
      name: "backend.zhadan",
      script: "dist/backend.zhadan.js",
      instances: 1,
      instance_var: 'INSTANCE_ID',
      env: {
        COMMON_VARIABLE: "true",
        NODE_ENV: "stage",
      },
      env_production: {
        NODE_ENV: "production"
      },
      log_date_format: "YYYY-MM-DD HH:mm Z"
    },
    {
      name: "backend.shisanshui",
      script: "dist/backend.shisanshui.js",
      instances: 1,
      instance_var: 'INSTANCE_ID',
      env: {
        COMMON_VARIABLE: "true",
        NODE_ENV: "stage",
      },
      env_production: {
        NODE_ENV: "production"
      },
      log_date_format: "YYYY-MM-DD HH:mm Z"
    },
    {
      name: "backend.majiang",
      script: "dist/backend.majiang.js",
      instances: 1,
      instance_var: 'INSTANCE_ID',
      env: {
        COMMON_VARIABLE: "true",
        NODE_ENV: "stage",
      },
      env_production: {
        NODE_ENV: "production"
      },
      log_date_format: "YYYY-MM-DD HH:mm Z"
    },
    {
      name: "backend.xmmajiang",
      script: "dist/backend.xmmajiang.js",
      instances: 1,
      instance_var: 'INSTANCE_ID',
      env: {
        COMMON_VARIABLE: "true",
        NODE_ENV: "stage",
      },
      env_production: {
        NODE_ENV: "production"
      },
      log_date_format: "YYYY-MM-DD HH:mm Z"
    },
  ],
}
