# 血流-麻将-扑克游戏游戏服源码

### 介绍
血流类游戏包含三个玩法，十二星座和血流红中和国标血流。麻将类包含两个玩法，红中麻将和厦门麻将。扑克类包含一个玩法，斗地主。

| 类型      | 链接                                                          |
|---------|-------------------------------------------------------------|
| 大厅服源码   | https://gitee.com/cyntc_1061451899/poker-majiang-dating.git |
| 游戏服源码   | https://gitee.com/cyntc_1061451899/poker-majiang.git        |
| web端演示  | https://phpadmin.tianle.fanmengonline.com/majiang/                            |
| 移动端H5演示 | https://phpadmin.tianle.fanmengonline.com/majiang/                            |

### 支持功能
- 血流类游戏包含三个玩法，十二星座和血流红中和国标血流。麻将类包含两个玩法，红中麻将和厦门麻将。扑克类包含一个玩法，斗地主。
- 十二星座仿指尖四川麻将-十二生肖。
- 血流红中仿指尖四川麻将-血流红中。
- 国标血流仿微乐福建麻将-百变国标。
- 红中麻将为福建浦城地区的地域性玩法，可以选择红中赖子，庄飞鸟，全飞鸟的特殊玩法。
- 厦门麻将仿微乐开心泉州麻将-厦门麻将。
- 斗地主仿欢乐斗地主-经典玩法。
- 自创十二星座玩法，去除麻将筒牌，使用十二星座牌替代，使用波塞冬，宙斯，雅典娜牌作为癞子牌
- 大厅活动包含幸运抽奖，登录礼包，游戏圈，开运好礼，新手宝典，充值派对，成就，新人福利，商城，邮件，背包，战绩
- 拥有丰富的页面交互和特效
- 支持移动端（由cocos开发，可打包H5、APP和小游戏）
- 支持简易后台管理，包括工作台数据统计，用户管理、数据汇总、系统设置等
- 项目持续更新中，每周发一次版本。

### 软件架构

后端技术栈：`nodejs8.11.2 + rabbitmq 3.8.9 + mongodb 3.4 + redis 3.2.8`
客户端技术栈：`cocos3.8.1+js`
管理后台技术栈：`vue2+element-UI`


### 安装教程
> 安装程序需要有一定的PHP经验和服务器运维经验，如果没有请加入交流群联系作者，作者提供付费部署服务！

#### 准备工作

需要先安装好运行环境，推荐使用docker，建议使用nginx作为服务器，不建议使用apache。需要安装以下软件：
|  所需环境 | 版本 | 备注 | 推荐版本 |
| --------- | ---- | ---- | ---|
| linux    | >= 7.0 |  以下的版本未做测试   | 7.9 |
| nginx    | >= 1.17 |     | 最新的 |
| nodejs | = 8 |  8    | 8.11.2 |
| mongo    | = 3.4 | 必须要3.4版本     | 3.4 |
| redis    | = 3.2.8 |     | 3.2.8 |
| rabbitmq    | = 3.8.9 |  用于消息服务部署  | 3.8.9 |

#### 源码下载
- 克隆代码到本地：
```
git clone https://gitee.com/cyntc_1061451899/poker-majiang.git
```
- 进入项目目录，执行：
```
npm install
```

- docker安装redis,rabbitmq,mongo
```
- 安装redis: docker run -p 6379:6379 --name redis -d redis redis-server --requirepass "qazwsx123!!"
```
```
- 安装rabbitmq: docker run -p 5672:5672 -p 15672:15672 --namer rabbitmq-server -d rabbitmq:3.8.9-management
- rabbitmq操作步骤：
- 进入rabbitmq
- docker exec -it tianle-rabbitmq-server bash
- 创建账号
- rabbitmqctl add_user user password
- 设置用户的角色和权限
- rabbitmqctl set_user_tags user administrator
- 设置用户的访问权限，三个星号分别代表配置、写和读的权限，表示用户具有完全的访问权限。
- rabbitmqctl set_permissions -p / user ".*" ".*" ".*"
```
```
安装mongodb: docker run --name data-mongo-1 -p 27017:27017 -d mongo:3.4
- Mongodb导入数据库
- 进入mongodb
- docker exec -it data-mongo-1 bash
- 导入数据库
- mongorestore --host 127.0.0.1 --port 27017 --db tianleServer /opt/dbs/tianleServer
```

- 修改服务端配置文件
- 进入/src/config目录下，如果是正式环境修改default.js和default.js的配置，如果是测试环境，修改proprod.js的配置。


- 启动服务器
```
pm2 startOrRestart ecosystem.config.js
```

- 设置nginx代理

```
server {
	listen       80;
	listen       [::]:80;
	server_name game.mahjong.com;

    #血流游戏服务
	location /gameWs {
		proxy_pass http://127.0.0.1:9597;
		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_set_header X-Real-IP $remote_addr;
		proxy_http_version 1.1;
		proxy_set_header Host $host;
		#让代理服务端不要主动关闭客户端的连接
		#proxy_ignore_client_abort on;

		proxy_read_timeout 300s;
		proxy_send_timeout 300s;
		proxy_set_header Upgrade $http_upgrade;
		proxy_set_header Connection $connection_upgrade;
	}
}
```

- 进入游戏服
```
- cd /project/tianle-game-server
- 录入房间号数据
- node ./dist/bin/setupRoomIds.js

- 录入短信验证码数据
- node ./dist/bin/setupSMSIds.js
```

- 大厅服更新脚本
```
cd /root/project/tianle-server || exit;
git pull;
npm install;
npm run build;
pm2 restart ecosystem.config.js;
```

- 游戏服更新脚本
```
cd /root/project/tianle-game-server || exit;
git pull;
npm install;
npm run build;
pm2 restart ecosystem.config.js;
```

- 如果有域名并且需要配置证书来开启HTTPS，可以使用免费的 `Let's Encrypt` 证书，如果不需要这些服务，可以直接使用HTTP协议,小游戏服务必须配置https。

### 安装部署服务

作者提供本系统的安装服务，包括后端和前端部署到线上，保证项目的完美运行，200元/次，安装服务可赠送详细的安装教程以及接口文档，如有需要可以进群联系作者！

### 交流群
如果有什么问题，请留言，或者加入我们的QQ群！

创作不易，点个star吧

[QQ 交流群：642610895](http://qm.qq.com/cgi-bin/qm/qr?_wv=1027&k=AjhXh31lV0NPJz3qAQ9J1Ui0yY8lDeNH&authKey=fnAhcR90n%2FEEYqWVr9IoBw9JjCdnU1P8yJ58Rq9esmvq3Fj%2FTUux%2FQcUvU92W7dE&noverify=0&group_code=642610895)
