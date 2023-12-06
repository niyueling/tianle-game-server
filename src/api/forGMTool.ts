import {Router} from 'express'
import * as moment from 'moment'
import Notice from '../database/models/notice'
import RoomRecord from '../database/models/roomRecord'
import RoomManager from '../match/paodekuai/centerlobby'
import PlayerManager from '../player/player-manager'

const router = Router()
export default router

router.get('/status', getGameStatus)
router.post('/dissolve', dissolveRoom)
router.post('/addResource', addResource)
router.post('/notice', notice)

async function getGameStatus(req, res) {
  const halfHourOfBefore = moment().subtract(30, 'minutes').toDate()
  const players = PlayerManager.getInstance().onLinePlayers
  const rooms = await RoomRecord.count({createAt: {$gt: halfHourOfBefore}}).lean().exec()

  res.json({
    online: {
      players, rooms
    }
  })
}

function dissolveRoom(req, res) {
  const {roomNum} = req.body
  const room = RoomManager.getInstance().getRoom(parseInt(roomNum, 10))

  console.log(`${__filename}:34 dissolveRoom`, roomNum, RoomManager.getInstance().rooms)
  if (room) {
    room.forceDissolve()
    res.json({ok: true})
  } else {
    res.json({ok: false, info: 'room not found'})
  }
}

async function addResource(req, res) {
  const {playerId, addGem, addGold} = req.body
  const player = PlayerManager.getInstance().getPlayer(playerId)
  if (player) {
    player.sendMessage('gmTool/addResource', {
      gem: addGem,
      gold: addGold,
    });
    player.model.gem += addGem
    player.model.gold += addGold

    res.json({ok: true})
  } else {
    res.json({ok: false, info: 'player maybe offline '})
  }
}

async function notice(req, res) {
  const {notice} = req.body
  PlayerManager.getInstance().notice(notice)

  try {
    await new Notice({message: notice}).save()
    res.json({ok: true})
  } catch (e) {
    console.log(`${__filename}:33 noticeAll`, e)
    res.json({ok: false})
  }
}
