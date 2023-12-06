export type Message = { name: string, payload: any, from?: string, ip?: string }

export interface IMessageSource {
  consume(consumer: (message: Message) => Promise<void>): void;

  close(): void
}


export interface IMessageEmitter {
  emit(message: Message)

  close(): void
}

export interface IMessageGroupEmitter {
  emit(message: Message, Ids: string[])

  close(): void
}


export function toBuffer(json: Message): Buffer {
  return new Buffer(JSON.stringify(json))
}
