// 厦门麻将接口
import {addApi} from "../../common/api";
import {BaseGameAction} from "../base/baseGameAction";
import Enums from "./enums";

export class GameAction extends BaseGameAction {

  @addApi({
    apiName: 'game/da'
  })
  async onGameDa(playerState, payload) {
    if (!this.room.gameState) {
      console.error('game not start');
      return;
    }
    return this.room.gameState.onPlayerDa(playerState, payload.turn, payload.card);
  }

  // 刷新
  @addApi({
    apiName: 'game/refreshQuiet'
  })
  async onRefresh(playerState, payload) {
    return this.room.gameState.onRefresh(playerState.seatIndex);
  }

  // // 过
  // @addApi({
  //   apiName: Enums.guo,
  // })
  // async onPlayerGuo(playerState, payload) {
  //   return this.room.gameState.onPlayerGuo(playerState, payload.turn, payload.card)
  // }
}
