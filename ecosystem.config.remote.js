module.exports = {
  apps: [
    {
      name: "wsserver",
      script: "dist/server.js",
      env: {
        COMMON_VARIABLE: "true"
      },
      env_production: {
        NODE_ENV: "production"
      }
    },
    {
      name: "backend.biaofen",
      script: "dist/backend.biaofen.js",
      instances: 1,
      instance_var: 'INSTANCE_ID',
      env: {
        COMMON_VARIABLE: "true"
      },
      env_production: {
        NODE_ENV: "production"
      }
    },
    {
      name: "backend.paodekuai",
      script: "dist/backend.paodekuai.js",
      instances: 2,
      instance_var: 'INSTANCE_ID',
      env: {
        COMMON_VARIABLE: "true"
      },
      env_production: {
        NODE_ENV: "production"
      }
    },
    {
      name: "backend.zhadan",
      script: "dist/backend.zhadan.js",
      instances: 1,
      instance_var: 'INSTANCE_ID',
      env: {
        COMMON_VARIABLE: "true"
      },
      env_production: {
        NODE_ENV: "production"
      }
    },
    {
      name: "backend.shisanshui",
      script: "dist/backend.shisanshui.js",
      instances: 1,
      instance_var: 'INSTANCE_ID',
      env: {
        COMMON_VARIABLE: "true"
      },
      env_production: {
        NODE_ENV: "production"
      }
    },
    {
      name: "backend.majiang",
      script: "dist/backend.majiang.js",
      instances: 1,
      instance_var: 'INSTANCE_ID',
      env: {
        COMMON_VARIABLE: "true"
      },
      env_production: {
        NODE_ENV: "production"
      }
    },
    {
      name: "crontab",
      script: "dist/schedules.js",
      env: {
        COMMON_VARIABLE: "true"
      },
      env_production: {
        NODE_ENV: "production"
      }
    }, {
      name: "gm-tool",
      script: "dist/gm-tool/server.js",
      env: {
        COMMON_VARIABLE: "true"
      },
      env_production: {
        NODE_ENV: "production"
      }
    }
  ],
  deploy: {
    production: {
      user: "root",
      host: "47.103.133.25",
      ref: "origin/paodekuai",
      repo: "git@git.oschina.net:gyrocopter/mahjong_server.git",
      path: "/root/mahjong_server",
      "post-deploy": "npm run build && pm2 startOrRestart ecosystem.config.js --env production"
    }
  }
}
