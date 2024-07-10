// 线上测试服配置
module.exports = {
  apps: [
    {
      name: "stage-game-server",
      script: "dist/server.js",
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
      name: "stage-majiang",
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
      name: "stage-xueliu",
      script: "dist/backend.xueliu.js",
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
      name: "stage-guobiao",
      script: "dist/backend.guobiao.js",
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
      name: "stage-pcmajiang",
      script: "dist/backend.pcmajiang.js",
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
      name: "stage-xmmj",
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
    {
      name: "stage-ddz",
      script: "dist/backend.doudizhu.js",
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
      name: "stage-zhadan",
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
    }
  ]
}
