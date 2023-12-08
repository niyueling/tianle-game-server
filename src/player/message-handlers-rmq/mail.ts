import {
  GiftState, Mail,
  MailModel,
  MailState,
  MailType,
  PublicMailModel,
  PublicMailRecordModel
} from "../../database/models/mail"
import PlayerModel from "../../database/models/player"
import {createLock} from '../../utils/lock'

const userLock = createLock()

const handler = {
  'mail/list': async player => {
    const privateMails = await MailModel
      .find({to: player._id})
      .sort({createAt: -1}).lean().exec()

    const publicMails = await PublicMailModel.find().sort({createAt: -1}).lean().exec()

    const publicMailRecords = await PublicMailRecordModel.find({
      player: player._id
    }).lean().exec()

    publicMails.forEach(mail => {
      const rec = publicMailRecords.find(r => r.mail === mail._id.toString())
      if (!rec) {
        mail.state = MailState.UNREAD
        mail.giftState = GiftState.AVAILABLE
      } else {
        mail.state = rec.state
        mail.giftState = rec.giftState || GiftState.AVAILABLE
      }
    })

    const mails = publicMails
      .filter(m => m.state !== MailState.DELETE)
      .concat(privateMails)

    player.sendMessage('mail/listReply', {mails})
  },

  'mail/read': async  (player, {_id}) => {

    try {
      await MailModel.update({to: player._id, _id}, {
        $set: {state: MailState.READ}
      }).exec()

      player.sendMessage('mail/readReply', {ok: true})
    } catch (e) {
      player.sendMessage('mail/readReply', {ok: false})
    }
  },

  'mail/readNotice': async (player, {_id}) => {

    try {

      await PublicMailRecordModel.findOneAndUpdate(
        {player: player._id, mail: _id},
        {$set: {state: MailState.READ}}, {upsert: true, setDefaultsOnInsert: true}).exec()

      player.sendMessage('mail/readNoticeReply', {ok: true})
    } catch (e) {
      player.sendMessage('mail/readNoticeReply', {ok: false})
    }
  },

  'mail/readAll': async player => {
    await MailModel.update({to: player._id}, {
      $set: {state: MailState.READ}
    }, {multi: true}).exec()

    player.sendMessage('mail/readAllReply', {ok: true})
  },

  'mail/delete': async (player, {_id}) => {

    await MailModel.remove({to: player._id, _id}).exec()

    player.sendMessage('mail/deleteReply', {ok: true})
  },

  'mail/deleteNotice': async (player, {_id}) => {

    try {

      await PublicMailRecordModel.findOneAndUpdate(
        {player: player._id, mail: _id},
        {$set: {state: MailState.DELETE}}, {upsert: true}).exec()

      player.sendMessage('mail/deleteNoticeReply', {ok: true})
    } catch (e) {
      player.sendMessage('mail/deleteNoticeReply', {ok: false})
    }

  },

  'mail/requestGift': async (player, {_id}) => {

    const originalGiftMail = await MailModel.findOneAndUpdate({to: player._id, _id, type: MailType.GIFT}, {
      $set: {giftState: GiftState.REQUESTED}
    })

    if (!originalGiftMail) {
      player.sendMessage('mail/requestGiftReply', {ok: false, info: '没有该礼物'})
    }

    if (originalGiftMail.giftState === GiftState.AVAILABLE) {
      await PlayerModel.findByIdAndUpdate({_id: player._id},
        {$inc: originalGiftMail.gift},
        {new: true, select: {gem: 1, gold: 1, ruby: 1}, rawResult: true}).exec()

      // Object.assign(player.model, pick(updatedModel, ['gem', 'ruby', 'gold']))

      await player.updateResource2Client();
      // player.sendMessage('resource/update', pick(player.model, ['gold', 'gem', 'ruby']))

      player.sendMessage('mail/requestGiftReply', {ok: true})
    } else {
      player.sendMessage('mail/requestGiftReply', {ok: false, info: '已经领取'})
    }
  },
  'mail/requestNoticeGift': async (player, {_id}) => {
    const giftMail = await PublicMailModel.findOne({_id, type: MailType.NOTICEGIFT})

    if (giftMail) {
      const unlock = await userLock(`gr${player._id}`, 3000)
      try {
        const record = await PublicMailRecordModel.findOneAndUpdate({mail: _id, player: player._id},
          {$set: {giftState: GiftState.REQUESTED}},
          {upsert: true, setDefaultsOnInsert: true}
        )

        if (record && record.giftState === GiftState.REQUESTED) {
          throw Error('已经领取')
        }

        await PlayerModel.findByIdAndUpdate({_id: player._id},
          {$inc: giftMail.gift},
          {new: true, select: {gem: 1, gold: 1, ruby: 1}, rawResult: true}).exec()

        // Object.assign(player.model, pick(updatedModel, ['gem', 'ruby', 'gold']))

        // player.sendMessage('resource/update', pick(player.model, ['gold', 'gem', 'ruby']))
        await player.updateResource2Client();
        player.sendMessage('mail/requestGiftReply', {ok: true})

      } catch (e) {

        player.sendMessage('mail/requestGiftReply', {ok: false, info: e.message})

      } finally {
        await unlock()
      }
    } else {
      player.sendMessage('mail/requestGiftReply', {ok: false, info: '没有该礼物'})
    }
  }

}

export default handler
