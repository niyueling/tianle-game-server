module.exports = {
  database: {
    url: "mongodb://172.19.148.251:27017/tianleServer"
  },
  websocket: {
    "port": 9596
  },
  http: {
    "port": 5002
  },
  logger: {
    "filename": "stage.log"
  },
  rabbitmq: {
    url: "amqp://user:password@localhost:5693"
  },
  redis: {
    port: 8399,
    host: "localhost",
    password: "8fkaetmR@@@@"
  },
  debug: {
    "message": false
  }
}
