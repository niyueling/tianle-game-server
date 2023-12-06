### 环境配置
* 首先安装 node.js v6.2.0 以上
* 安装 mongodb 最新版并启动

## 开发
* 安装、更新依赖: `npm install`
* 开发运行: `npm run dev`
* 运行测试: `npm run test`

## 产品服务器
* 运行发布版本: `npm run start`

## Windows服务器:
* 首先需要安裝forever:
```
npm install -g forever
```

* 后台运行
```
forever start dist/server.js
```

* 停止服务器
```
forever stop dist/server.js
```

## GM工具
* GM工具使用 html 实现，在另一个仓库 gm-tool 中
* GM工具和游戏服务器可以分开部署
* 需要修改 config/ 下的相关配置，把 GM工具 部署的域名加入 gm-tool.allowOrigins 列表里
