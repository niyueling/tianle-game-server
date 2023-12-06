import ConsumeRecord from "../database/models/consumeRecord"
import PlayerModel from "../database/models/player";


export interface IAccountant {
  chargeWithGem(playerId: string, gem: number, note: string): Promise<void>

  chargeWithGold(playerId: string, gold: number, note: string): Promise<void>
}


export class Accountant implements IAccountant {
  async chargeWithGem(playerId: string, gem, note: string): Promise<void> {

    const updatedModel: { gem: number } = await PlayerModel.findByIdAndUpdate({_id: playerId},
      {$inc: {gem: -gem}},
      {new: true, select: {gem: 1, gold: 1}, rawResult: true}).exec()

    await new ConsumeRecord({player: playerId, gem, note: `gem:${-gem} => ${updatedModel.gem} ${note}`}).save()

  }

  async chargeWithGold(playerId, gold, note): Promise<void> {
    const updatedModel: { gold: number } = await
      PlayerModel.findByIdAndUpdate({_id: playerId},
        {$inc: {gold: -gold}},
        {new: true, select: {gem: 1, gold: 1}, rawResult: true}).exec()

    await new ConsumeRecord({player: playerId, gold, note: `gold:${gold} => ${updatedModel.gold} ${note}`}).save()
  }
}
