

## key gen

use other deploy key


## basic install

```bash

apt-get update

apt-get install -y git nginx

curl -LO https://npm.taobao.org/mirrors/node/v8.11.1/node-v8.11.1-linux-x64.tar.gz
sudo tar -C /usr/local --strip-components 1 -xzf node-v8.11.1-linux-x64.tar.gz

curl https://gist.githubusercontent.com/stormslowly/f030bd49608e7ab5196e6565a9f5c002/raw/97dc1d531d365c0f87282d21fe4fcf29dab995a8/gitconfig -o /root/.gitconfig
curl https://gist.githubusercontent.com/stormslowly/f030bd49608e7ab5196e6565a9f5c002/raw/97dc1d531d365c0f87282d21fe4fcf29dab995a8/npmrc -o /root/.npmrc


npm i npm -g
npm i yarn pm2 -g

pm2 install pm2-logrotate
pm2 set pm2-logrotate:compress true
```

## docker ce Ubuntu Xenial 16.04 (LTS)

```bash
sudo apt-get remove docker docker-engine docker.io
sudo apt-get install -y apt-transport-https ca-certificates curl software-properties-common

curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -

sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"

sudo apt-get update
sudo apt-get install docker-ce

pip install docker-compose
8
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json <<-'EOF'
{
  "registry-mirrors": ["https://v3lax1zc.mirror.aliyuncs.com"]
}
EOF
sudo systemctl daemon-reload
sudo systemctl restart docker


curl -L https://github.com/docker/compose/releases/download/1.15.0/docker-compose-`uname -s`-`uname -m` > /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

```



# redis

```
sudo wget http://download.redis.io/releases/redis-3.0.4.tar.gz
sudo tar xzf redis-3.0.4.tar.gz
cd redis-3.0.4
cd deps ; sudo make hiredis jemalloc linenoise lua ; cd ..
sudo make
sudo make install
cp redis.confg  /etc/
```

```
db.createUser(
          {
              user: "ulong_remote",
                  pwd: "hzgzlNYH5EVQO2XU",
                      roles: [ { role: "readWrite", db: "mahjong" } ]
                        }
        )


db.createUser(
          {
              user: "root",
                  pwd: "4aIVVR!kvJTSkYfN8HMKeJ",
                      roles: [ {role:  "dbOwner" , db:"admin" } ]
                        }
        )
          })
          })
```
