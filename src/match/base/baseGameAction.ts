// 游戏接口
export class BaseGameAction {
  room: any
  // tslint:disable-next-line:variable-name
  __apiMap: any
  constructor(room) {
    this.room = room;
  }

  static getMethodName(method) {
    if (this.prototype.__apiMap && this.prototype.__apiMap.get(method)) {
      return this.prototype.__apiMap.get(method);
    }
    return '';
  }

  getPlayerState(playerId) {
    if (!this.room.gameState) {
      console.error('game not start')
      return null;
    }
    return this.room.gameState.getPlayerStateById(playerId);
  }
}
