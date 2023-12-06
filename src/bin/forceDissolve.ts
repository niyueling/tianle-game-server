import * as rabbitMq from "amqplib"

async function main() {

  const gameType = process.argv[2]
  const roomNumber = process.argv[3]
  const connect = await rabbitMq.connect("amqp://user:password@localhost:5672")
  const ch = await connect.createChannel()
  ch.publish('exGameCenter',
    `${gameType}.${roomNumber}`,
    new Buffer(JSON.stringify({name: 'forceDissolve'}))
  )
  console.log(`${gameType}.${roomNumber}`, {name: 'forceDissolve'}, 'send')
  await ch.close()
  await connect.close()
}

main().catch(error => {
  console.error(error)
  process.exit(-1)
})
