import {Channel, Replies} from "amqplib"
import * as winston from 'winston'
import {IMessageSource, Message} from "./index"

const logger = new winston.Logger({
  transports: [new winston.transports.Console()]
})

export class RabbitQueueMessageSource implements IMessageSource {

  private channel: Channel
  private readonly queueName: string
  private queue: Replies.AssertQueue
  private consumerTag: string = null

  constructor(queueName: string, channel: Channel) {
    this.queueName = queueName
    this.channel = channel
  }


  async consume(consumer: (message: Message) => Promise<void>) {
    this.queue = await this.channel.assertQueue(this.queueName, {
      durable: false,
      autoDelete: true
    })
    const queueConsume = await this.channel.consume(this.queue.queue, async (message) => {
      if (!message) return

      try {
        const messageBody = JSON.parse(message.content.toString())
        await consumer(messageBody)
      } catch (e) {
        logger.error('handle message', message.content.toString(), 'with error', e)
      }
    }, {noAck: true})
    this.consumerTag = queueConsume.consumerTag
  }

  async close(): Promise<void> {
    try {
      await this.channel.deleteQueue(this.queueName)
      if (this.consumerTag) await this.channel.cancel(this.consumerTag)
    } catch (e) {
      logger.error(`delete queue/cancel ${this.queueName} failed`, e)
    }
  }
}
