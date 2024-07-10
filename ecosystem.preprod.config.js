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
    },
    {
      name: "tianle-xueliu-server",
      script: "dist/backend.xueliu.js",
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
    },
    {
      name: "tianle-guobiao-server",
      script: "dist/backend.guobiao.js",
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
    },
    {
      name: "tianle-pcmajiang-server",
      script: "dist/backend.pcmajiang.js",
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
    },
    {
      name: "tianle-xmmj-server",
      script: "dist/backend.xmmajiang.js",
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
    },
    {
      name: "tianle-ddz-server",
      script: "dist/backend.doudizhu.js",
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
    },
    {
      name: "tianle-zhadan-server",
      script: "dist/backend.zhadan.js",
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
