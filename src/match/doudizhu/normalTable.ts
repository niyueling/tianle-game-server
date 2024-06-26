import Card, {CardType} from "./card"
import {
  findFullMatchedPattern,
  findMatchedPatternByPattern,
} from "./patterns"
import {IPattern, PatterNames} from "./patterns/base"
import PlayerState from "./player_state"
import Rule from './Rule'
import Table from './table'
import {GameType} from "@fm/common/constants";
import enums from "./enums";

function once(target, propertyKey: string, descriptor: PropertyDescriptor) {
  const originCall = descriptor.value
  const key = `__once_${propertyKey}`

  descriptor.value = function (...argv) {
    if (this[key]) {
      return
    } else {
      this[key] = true
      originCall.apply(this, argv)
    }
  }
}

export default class NormalTable extends Table {
  mode: string
  foundFriend: boolean = false
  private readonly settler: () => void = null
  private readonly findFullMatchedPatternImp: (cards: Card[]) => (IPattern | null) = findFullMatchedPattern
  private readonly findMatchedPatternByPatternImp: (pattern: IPattern, cards: Card[], rule: Rule) => Card[][]
    = findMatchedPatternByPattern

  constructor(room, rule: Rule, restJushu) {
    super(room, rule, restJushu)

    this.settler = this.shangYouSettler
  }

  resume(json) {
    super.resume(json)
  }

  toJSON() {
    return super.toJSON()
  }

  name() {
    return GameType.ddz
  }

  async start(payload) {
    await this.fapai(payload)
    this.status.current.seatIndex = -1
    this.startStateUpdate()
  }

  startStateUpdate() {
    if (this.room.game.lastWinnerShortId !== -1) {
      // 有上一局赢的人,则赢家先选择地主
      for (let i = 0; i < this.players.length; i++) {
        const p = this.players[i];
        if (p.model.shortId === this.room.game.lastWinnerShortId) {
          this.setFirstDa(i);
          break;
        }
      }
    } else {
      this.setFirstDa(0);
    }

    // 选择地主
    this.broadcastChooseMode();
  }

  // broadcastFirstDa() {
  //   this.tableState = ''
  //   this.room.broadcast('game/startDa', {ok: true, data: {index: this.currentPlayerStep}})
  //   this.depositForPlayer(this.players[this.currentPlayerStep]);
  // }

  broadcastChooseMode() {
    this.tableState = ''
    this.room.broadcast('game/startChooseMode', {ok: true, data: {index: this.currentPlayerStep}})

    const chooseModeFunc = async() => {
      this.players[this.currentPlayerStep].emitter.emit(enums.chooseMode, {mode: enums.farmer});
      // this.depositForPlayerChooseMode(this.players[this.currentPlayerStep]);
    }

    setTimeout(chooseModeFunc, 1000);
  }

  setFirstDa(startPlayerIndex: number) {
    this.status.current.seatIndex = startPlayerIndex;
    // 第一个打的
    this.audit.setFirstPlay(this.players[startPlayerIndex].model.shortId);
  }

  isGameOver(): boolean {
    return this.players.some(p => p.cards.length === 0);
  }

  bombScorer(bomb: IPattern): number {
    if (bomb.name !== PatterNames.bomb) return 0
    let bombLen = bomb.cards.length

    if (bomb.cards.every(c => c.type === CardType.Joker)) {
      return 16
    }

    if (bomb.cards.some(c => c.value === 2)) {
      bombLen += 1
    }

    if (bombLen < 5) return 0

    return Math.pow(2, bombLen - 5)
  }

  listenPlayer(player: PlayerState) {
    super.listenPlayer(player)
  }

  reconnectContent(index, reconnectPlayer: PlayerState) {
    const stateData = this.stateData;
    const juIndex = this.room.game.juIndex;

    const status = this.players.map(player => {
      return player._id.toString() === reconnectPlayer._id.toString() ? {
        ...player.statusForSelf(this),
        teamMateCards: this.teamMateCards(player)
      } : player.statusForOther(this)
    })
    const currentPlayerIndex = this.status.current.seatIndex;

    return {
      mode: this.mode,
      currentPlayer: currentPlayerIndex,
      lastPattern: this.status.lastPattern,
      lastIndex: this.status.lastIndex,
      from: this.status.from,
      foundFriend: this.foundFriend,
      index,
      juIndex,
      stateData,
      status
    }
  }

  async onPlayerDa(player: PlayerState, {cards: plainCards}) {
    const cards = plainCards.map(Card.from)
    const isOk = this.playManager.isAllowPlayCard(cards, player.cards);
    if (!isOk) {
      return this.cannotDaPai(player, cards, this.playManager.noPattern);
    }

    await super.onPlayerDa(player, {cards: plainCards})
  }

  async gameOver() {
    this.updateRemainCards();
    this.settler();
    // this.audit.print();
    const states = this.players.map(p => {
      const auditInfo = this.audit.currentRound[p.model.shortId];
      return {
        model: p.model,
        index: p.index,
        score: p.balance,
        detail: p.detailBalance,
        // 统计信息
        audit: {
          remainCards: auditInfo.remainCards,
          orderList: auditInfo.orderList,
          springScore: auditInfo.springScore,
          antSpringScore: auditInfo.antSpringScore,
          boomTimes: auditInfo.boomTimes,
        },
      }
    })

    const gameOverMsg = {
      states,
      juShu: this.restJushu,
      isPublic: this.room.isPublic,
      juIndex: this.room.game.juIndex,
      mode: this.mode,
      creator: this.room.creator.model._id,
    }
    this.room.broadcast('game/gameOverReply', {ok: true, data: gameOverMsg})
    this.stateData.gameOver = gameOverMsg

    let firstPlayer = this.players.find(p => p.cards.length === 0)

    await this.roomGameOver(states, firstPlayer._id);
  }

  private shangYouSettler() {
    const winner = this.players.find(p => p.cards.length === 0)
    const losers = this.players.filter(p => p.cards.length > 0)
      .sort((p1, p2) => p2.cards.length - p1.cards.length);
    console.warn("winner-%s, losers-%s", JSON.stringify(winner), JSON.stringify(losers));
    let factor = 1
    if (losers[0].cards.length === 16) {
      factor = 2
    }
    winner.winFrom(losers[0], 2 * factor)
    if (losers[0].cards.length === losers[1].cards.length) {
      winner.winFrom(losers[1], 2 * factor)
    } else {
      winner.winFrom(losers[1], factor)
    }
  }

  findFullMatchedPattern(cards: Card[]): IPattern | null {
    return this.findFullMatchedPatternImp(cards)
  }

  findMatchedPatternByPattern(currentPattern: IPattern, cards: Card[]): Card[][] {
    return this.findMatchedPatternByPatternImp(currentPattern, cards, this.rule)
  }

  // 设置剩余牌
  updateRemainCards() {
    for (const p of this.players) {
      this.audit.setRemainCards(p.model.shortId, p.cards);
    }
  }

  // 更新炸弹分
  updateBoomScore() {
    let score;
    for (const p of this.players) {
      for (const pp of this.players) {
        if (p.model.shortId !== pp.model.shortId) {
          score = this.audit.boomScore(p.model.shortId);
          if (score > 0) {
            p.winFrom(pp, score);
          }
        }
      }
    }
  }
};
