import {GameType, RobotStep, TianleErrorCode} from "@fm/common/constants";
import {service} from "../../service/importService";
import {CardType} from "./card";
import {arraySubtract} from "./patterns/base";
import PlayerState from "./player_state";
import Table, {Team} from "./table";
import Enums from "./enums";

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
  selectModeTimeout: NodeJS.Timeout

  private nextAction: () => void = null

  name() {
    return "guandan"
  }

  async start(payload) {
    this.faPaiPayload = payload;
    if (!this.room.robotManager) {
      await this.room.init();
    }

    await this.setPlayerTeamMate();

    const faPaiFunc = async() => {
      if (this.rule.allowDouble) {
        await this.broadcastModeRequest();

        if (this.room.isPublic) {
          await this.room.robotManager.setCardReady(this.rule.allowDouble);
        }
      } else {
        await this.startFaPai(payload);
      }
    }

    setTimeout(faPaiFunc, 1000);
  }

  async startFaPai(payload) {
    const levelCard = this.cards.find(c => c.type === 1 && c.value === this.room.currentLevelCard);
    this.players[0].record("openLevelCard", [levelCard]);
    this.room.broadcast("game/openLevelCard", {ok: true, data: {currentLevelCard: this.room.currentLevelCard, homeTeamCard: this.room.homeTeamCard, awayTeamCard: this.room.awayTeamCard}});

    if (this.rule.shuffleType === 2) {
      // 不洗牌
      await this.publicRoomFapai();
    } else {
      // 随机发牌
      await this.fapai(payload);
    }

    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      // 判断是否使用记牌器
      const cardRecorderStatus = await this.getCardRecorder(p);
      p.onShuffle(0, this.restJushu, p.cards, i, this.room.game.juIndex, this.room.shuffleData.length > 0,
        cardRecorderStatus, {homeTeamCard: this.room.homeTeamCard, awayTeamCard: this.room.awayTeamCard, currentLevelCard: this.room.currentLevelCard});
    }

    const shuffleData = this.room.shuffleData.map(x => {
      const p = this.players.find(y => y.model._id.toString() === x.toString());
      return p.index;
    })
    this.shuffleDelayTime = Date.now() + this.room.shuffleData.length * 5000;
    this.room.broadcast('game/shuffleData', {ok: true, data: {shuffleData}});
    this.status.current.seatIndex = -1;
    // 金豆房扣除开局金豆
    if (this.room.gameRule.isPublic) {
      await this.room.payRubyForStart();
    }
    this.nextAction = this.startTeamworkGame;
    this.next();
  }

  resume(json) {
    super.resume(json)
  }

  toJSON() {
    if (this.state === 'gameOver') return null
    // return Object.assign(superJSON, {test: 'test1'})
    return super.toJSON()
  }

  private async broadcastModeRequest() {
    this.tableState = 'selectMode';
    for (const player of this.players) {
      if (!player.isChooseMode) {
        // player.msgDispatcher.on('game/chooseMultiple', async ({double}) => {
        //   await this.onSelectMode(player, double);
        //   this.room.emit('selectMode', {});
        // })

        player.sendMessage('game/startChooseMultiple', {ok: true, data: {}})
        this.autoCommitFunc();
      }
    }
  }

  @once
  private next() {

    clearTimeout(this.selectModeTimeout)
    for (const p of this.players) {
      p.msgDispatcher.removeAllListeners('game/chooseMultiple')
    }

    this.tableState = '';
    this.room.emit('selectMode', {});
    this.nextAction();

    this.autoCommitFunc()
  }

  async onSelectMode(player: PlayerState, multiple = 1) {
    const index = this.players.findIndex(p => p._id.toString() === player._id.toString());
    player.multiple = multiple;
    player.isChooseMode = true;
    this.multiple += (multiple === 1 ? 0 : 1);
    player.record(`select-mode-${multiple}`, []);
    this.room.broadcast("game/chooseMultipleReply", {ok: true, data: {seatIndex: index, isMultiple: player.isChooseMode, double: player.multiple, gameMultiple: this.multiple}});
    // console.warn("index %s multiple %s isChooseMode %s", index, player.multiple, player.isChooseMode);
    const isOk = await this.canStartGame();
    if (isOk) {
      this.next()
    }
  }

  async onPayTribute(player: PlayerState, msg) {
    // 如果用户不需要进贡
    if (!player.payTributeState) {
      return player.sendMessage("game/payTributeReply", {ok: false, info: TianleErrorCode.isNeverPayTribute});
    }

    // 如果手牌种没有用户进贡的牌
    const index = player.cards.findIndex(c => c.type === msg.card.type && c.point === msg.card.point);
    if (index === -1) {
      return player.sendMessage("game/payTributeReply", {ok: false, info: TianleErrorCode.cardIsNotExists});
    }

    if (msg.card.type === CardType.Heart && msg.card.value === this.room.currentLevelCard) {
      return player.sendMessage("game/payTributeReply", {ok: false, info: TianleErrorCode.neverPayTributeCaiShen});
    }

    const cardSlices = player.cards.slice();
    const sortCard = cardSlices.sort((grp1, grp2) => {
      return grp2.point - grp1.point
    });
    const caiShen = cardSlices.filter(c => c.type === CardType.Heart && c.value === this.room.currentLevelCard);
    const subtractCards = arraySubtract(sortCard.slice(), caiShen);

    // 如果手牌中去掉癞子，进贡的牌不是剩下的牌最大的牌，则进贡失败
    if (msg.card.point < subtractCards[0].point) {
      return player.sendMessage("game/payTributeReply", {ok: false, info: TianleErrorCode.cardIsNotMax});
    }

    player.payTributeCard = msg.card;
    // this.players[player.seatIndex > 0 ? player.seatIndex - 1 : 3].payTributeCard = msg.card;
    player.record(`pay-tribute`, [msg.card]);
    this.room.broadcast("game/payTributeReply", {ok: true, data: {seatIndex: player.seatIndex, card: msg.card}});

    const isOk = await this.canPayAndReturnTribute();
    if (isOk) {
      await this.nextToStartGame()
    }
  }

  async onReturnTribute(player: PlayerState, msg) {
    // 如果用户不需要还贡
    if (!player.returnTributeState) {
      return player.sendMessage("game/returnTributeReply", {ok: false, info: TianleErrorCode.isNeverReturnTribute});
    }

    // 如果手牌没有用户进贡的牌
    const index = player.cards.findIndex(c => c.type === msg.card.type && c.point === msg.card.point);
    if (index === -1) {
      return player.sendMessage("game/returnTributeReply", {ok: false, info: TianleErrorCode.cardIsNotExists});
    }

    if (msg.card.type === CardType.Heart && msg.card.value === this.room.currentLevelCard) {
      return player.sendMessage("game/returnTributeReply", {ok: false, info: TianleErrorCode.neverReturnTributeCaiShen});
    }

    const isLevelCard = CardType.Heart === msg.card.type && this.room.currentLevelCard === msg.card.value;

    // 规则设置任意牌可还贡，不能还癞子。设置还贡10以下，不能还贡10以上牌型
    if ((msg.card.point > 10 && this.rule.resoreTribute === 1) || (isLevelCard && this.rule.resoreTribute === 2)) {
      return player.sendMessage("game/returnTributeReply", {ok: false, info: TianleErrorCode.cardIsInvaid});
    }

    player.returnTributeCard = msg.card;
    // this.players[player.seatIndex < 3 ? player.seatIndex + 1 : 0].returnTributeCard = msg.card;
    player.record(`return-tribute`, [msg.card]);
    this.room.broadcast("game/returnTributeReply", {ok: true, data: {seatIndex: player.seatIndex, card: msg.card}});

    const isOk = await this.canPayAndReturnTribute();
    if (isOk) {
      await this.nextToStartGame()
    }
  }

  async nextToStartGame() {
    await this.calcPayAndReturnTribute();

    const startFunc = async () => {
      // console.warn("nextSeatIndex %s", this.nextSeatIndex);
      this.tableState = '';
      if (this.room.isPublic) {
        this.room.robotManager.model.step = RobotStep.running;
      }

      this.setTeamMate();
      this.setFirstDa(this.nextSeatIndex !== -1 ? this.nextSeatIndex : 0);
      this.mode = 'teamwork';
      this.broadcastFirstDa();
      this.autoCommitFunc();
    }

    setTimeout(startFunc, 1500);
  }

  async canPayAndReturnTribute(): Promise<boolean> {
    for (const player of this.players) {
      if ((player.payTributeState && !player.payTributeCard) || (player.returnTributeState && !player.returnTributeCard)) {
        return false;
      }
    }

    return true
  }

  async calcPayAndReturnTribute() {
    const payAndReturnIndex = this.players.findIndex(p => p.payTributeState || p.returnTributeState);
    if (payAndReturnIndex !== -1) {
      // 单下，末游给头游进贡
      if (!this.isAllTribute) {
        // 查询进贡用户
        const payTributePlayer = this.players.find(p => p.payTributeState);

        // 查询还贡用户
        const returnTributePlayer = this.players.find(p => p.returnTributeState);
        // console.warn("isAllTribute %s kangTribute %s payTributePlayerId %s returnTributePlayerId %s", this.isAllTribute,
        //   JSON.stringify(this.kangTribute), payTributePlayer && payTributePlayer._id, returnTributePlayer && returnTributePlayer._id);

        payTributePlayer.returnTributeCard = returnTributePlayer.returnTributeCard;
        payTributePlayer.returnTributeIndex = returnTributePlayer.seatIndex;
        returnTributePlayer.payTributeCard = payTributePlayer.payTributeCard;
        returnTributePlayer.payTributeIndex = payTributePlayer.seatIndex;
      }

      // 双下无抗贡，则进贡大牌给头游，剩下的牌给二游
      if (this.isAllTribute && !this.kangTribute.length) {
        // 查询进贡用户
        const payTributePlayer = this.players.filter(p => p.payTributeState).sort((grp1, grp2) => {
          return grp1.payTributeCard.point - grp2.payTributeCard.point
        });

        // 查询还贡用户
        const team = this.room.winOrderLists.find(w => w.winOrder === 1).team;
        const winPlayers = this.room.winOrderLists.filter(p => p.team === team).sort((grp1, grp2) => {
          return grp1.winOrder - grp2.winOrder
        });
        const firstPlayer = this.players.find(p => p._id.toString() === winPlayers[0].playerId.toString());
        const secondPlayer = this.players.find(p => p._id.toString() === winPlayers[1].playerId.toString());

        // 进贡牌面较小的给二游
        payTributePlayer[0].returnTributeCard = secondPlayer.returnTributeCard;
        payTributePlayer[0].returnTributeIndex = secondPlayer.seatIndex;
        secondPlayer.payTributeCard = payTributePlayer[0].payTributeCard;
        secondPlayer.payTributeIndex = payTributePlayer[0].seatIndex;

        // 进贡牌面较大的给头游
        payTributePlayer[1].returnTributeCard = firstPlayer.returnTributeCard;
        payTributePlayer[1].returnTributeIndex = firstPlayer.seatIndex;
        firstPlayer.payTributeCard = payTributePlayer[1].payTributeCard;
        firstPlayer.payTributeIndex = payTributePlayer[1].seatIndex;
      }

      // 执行换牌逻辑
      for (const player of this.players) {
        if (player.payTributeState || player.returnTributeState) {
          // console.warn("payTributeState %s returnTributeState %s payTributeCard %s returnTributeCard %s",
          //   player.payTributeState, player.returnTributeState, JSON.stringify(player.payTributeCard), JSON.stringify(player.returnTributeCard));

          if (player.payTributeState) {
            const payTributeCardIndex = player.cards.findIndex(c => c.type === player.payTributeCard.type && c.point === player.payTributeCard.point);
            player.cards.splice(payTributeCardIndex, 1);
            player.cards.push(player.returnTributeCard);
          }

          if (player.returnTributeState) {
            const returnTributeCardIndex = player.cards.findIndex(c => c.type === player.returnTributeCard.type && c.point === player.returnTributeCard.point);
            player.cards.splice(returnTributeCardIndex, 1);
            player.cards.push(player.payTributeCard);
          }

          this.room.broadcast("game/payAndReturnCards", {ok: true, data: {player: player.seatIndex, type: player.payTributeState ? "pay" : "return",
              payTributeCard: player.payTributeCard, returnTributeCard: player.returnTributeCard, cards: player.cards.length, payTributeIndex: player.payTributeIndex, returnTributeIndex: player.returnTributeIndex}});
        }
      }

      const firstWinOrder = this.room.winOrderLists.find(w => w.winOrder === 1);
      const firstPlayerIndex = this.players.findIndex(p => p._id.toString() === firstWinOrder.playerId.toString());
      const firstTeamPlayerId = this.players.find(p => p.team === firstWinOrder.team && p._id.toString() !== firstWinOrder.playerId.toString())._id.toString();
      const firstTeamPlayerWinOrder = this.room.winOrderLists.find(w => w.playerId.toString() === firstTeamPlayerId).winOrder;
      const lastWinOrder = this.room.winOrderLists.find(w => w.winOrder === 99);
      const lastPlayerIndex = this.players.findIndex(p => p._id.toString() === lastWinOrder.playerId.toString());

      // console.warn("firstTeamPlayerWinOrder %s, lastPlayerIndex %s", firstTeamPlayerWinOrder, lastPlayerIndex);

      // 单下，末游先出牌
      if (firstTeamPlayerWinOrder > 2) {
        this.nextSeatIndex = lastPlayerIndex;
      }

      // 双下
      if (firstTeamPlayerWinOrder === 2) {
        // 检测进贡的牌，进贡牌大的先出
        const payPlayers = this.players.filter(p => p.payTributeState).map(p => {
          return {
            index: p.seatIndex,
            payTributeCard: p.payTributeCard
          }
        });

        let nextSeatIndex = -1;
        if (payPlayers[0].payTributeCard.point > payPlayers[1].payTributeCard.point) {
          nextSeatIndex = payPlayers[0].index;
        }
        if (payPlayers[0].payTributeCard.point < payPlayers[1].payTributeCard.point) {
          nextSeatIndex = payPlayers[1].index;
        }

        // 如果进贡的牌相同，则上一局头游的上游先出牌
        if (payPlayers[0].payTributeCard.point === payPlayers[1].payTributeCard.point) {
          nextSeatIndex = firstPlayerIndex > 0 ? firstPlayerIndex - 1 : 3;
        }

        this.nextSeatIndex = nextSeatIndex;
      }

      // 抗贡，头游先出
      if (this.kangTribute.length) {
        this.nextSeatIndex = firstPlayerIndex;
      }
    }
  }

  listenPlayer(player) {
    super.listenPlayer(player);
    this.listenerOn.push('game/chooseMultiple');
    this.listenerOn.push('game/payTribute');
    this.listenerOn.push('game/returnTribute');

    player.msgDispatcher.on('game/chooseMultiple', async ({double}) => {
      await this.onSelectMode(player, double);
      this.room.emit('selectMode', {});
    })

    player.msgDispatcher.on('game/payTribute', async (msg) => {
      await this.onPayTribute(player, msg);
      this.room.emit('payTribute', {});
    })

    player.msgDispatcher.on('game/returnTribute', async (msg) => {
      await this.onReturnTribute(player, msg);
      this.room.emit('returnTribute', {});
    })
  }

  async canStartGame(): Promise<boolean> {
    for (const player of this.players) {
      if (!player.isChooseMode) {
        return false;
      }
    }

    await this.startFaPai(this.faPaiPayload);
    // this.nextAction = this.startTeamworkGame;

    return true
  }

  broadcastFirstDa() {
    this.room.broadcast('game/startDa', {ok: true, data: {index: this.currentPlayerStep}});
  }

  private beTeamMate(team: PlayerState[]) {
    team[0].teamMate = team[1].index;
    team[1].teamMate = team[0].index;

    this.room.broadcast("game/matchFriends", {ok: true, data: {teamMate: [team[1].index, team[0].index], team: team[0].team}})
  }

  setTeamMate() {
    this.beTeamMate(this.homeTeamPlayers());
    this.beTeamMate(this.awayTeamPlayers());
  }

  startTeamworkGame() {
    // 如果非第一局，需要处理进还贡
    if (this.room.game.juIndex > 1) {
      let isAllTribute = false;
      let kangTribute = [];

      // 判断上一把头游用户
      const team = this.room.winOrderLists.find(w => w.winOrder === 1).team;
      const winPlayers = this.room.winOrderLists.filter(p => p.team === team);

      if (winPlayers[1].winOrder === 2) {
        isAllTribute = true;
      }

      // 用户有双大王
      const doubleMaxJokerPlayer = this.players.filter(p => p.cards.filter(c => c.type === CardType.Joker && c.point === 17).length === 2);
      if (doubleMaxJokerPlayer.length) {
        const doubleWinOrderPlayer = this.room.winOrderLists.find(p => p.playerId.toString() === doubleMaxJokerPlayer[0]._id.toString());

        // 双下用户是末游，或者单下用户是末游,扛贡成功
        if (doubleWinOrderPlayer.winOrder === 99) {
          kangTribute.push(doubleMaxJokerPlayer[0]._id);
          this.room.broadcast('game/conflicteTribute', {ok: true, data: {index: doubleMaxJokerPlayer[0].seatIndex}});

          return this.nextToStartGame();
        }
      }

      // 无人抗贡，则判断进还贡
      for (const player of this.players) {
        const winOrderPlayer = this.room.winOrderLists.find(p => p.playerId.toString() === player._id.toString());

        // 双下，两个末游要向两个头游进贡一张，单下，末游向头游进贡一张
        if ((isAllTribute && winOrderPlayer.winOrder > 2) || (!isAllTribute && winOrderPlayer.winOrder === 99)) {
          player.payTributeState = true;
          this.room.broadcast('game/startPayTribute', {ok: true, data: {index: player.seatIndex}});

          // 单下，向头游进贡
          if (!isAllTribute) {
            // 查询头游玩家,向头游进贡
            const firstOrderPlayer = this.room.winOrderLists.find(p => p.winOrder === 1);
            const firstPlayer = this.players.find(p => p._id.toString() === firstOrderPlayer.playerId.toString());
            firstPlayer.returnTributeState = true;
            this.room.broadcast('game/startReturnTribute', {ok: true, data: {index: firstPlayer.seatIndex}});
          }
        }
      }

      this.kangTribute = kangTribute;
      this.isAllTribute = isAllTribute;

      // 双下，向赢家进贡
      if (isAllTribute) {
        for (const player of winPlayers) {
          const winPlayer = this.players.find(p => p._id.toString() === player.playerId.toString());
          winPlayer.returnTributeState = true;
          this.room.broadcast('game/startReturnTribute', {ok: true, data: {index: winPlayer.seatIndex}});
        }
      }

      const payAndReturnState = this.players.findIndex(p => p.payTributeState || p.returnTributeState);
      // console.warn("payAndReturnState %s", payAndReturnState);
      if (payAndReturnState !== -1) {
        this.tableState = "returnTribute";
        if (this.room.isPublic) {
          this.room.robotManager.model.step = RobotStep.returnTribute;
        }

        return this.autoCommitFunc();
      }
    }

    this.nextToStartGame()
  }

  isGameOver(): boolean {
    return super.isGameOver();
  }

  async reconnectContent(index, reconnectPlayer: PlayerState) {
    const stateData = this.stateData
    const juIndex = this.room.game.juIndex
    const status = [];

    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      status.push(p._id.toString() === reconnectPlayer._id.toString() ? {
        ...await p.statusForSelf(this),
        teamMateCards: this.teamMateCards(p)
      } : await p.statusForOther(this));
    }

    let tribute = {};
    if (reconnectPlayer.team === 0) {
      tribute = {currentLevelCard: this.room.currentLevelCard, homeTeamCard: this.room.homeTeamCard, awayTeamCard: this.room.awayTeamCard, multile: this.multiple};
    }
    if (reconnectPlayer.team === 1) {
      tribute = {currentLevelCard: this.room.currentLevelCard, homeTeamCard: this.room.homeTeamCard, awayTeamCard: this.room.awayTeamCard, multile: this.multiple};
    }

    return {
      mode: this.mode,
      currentPlayer: this.status.current.seatIndex,
      lastPattern: this.status.lastPattern,
      isGameRunning: this.state === 'gameOver',
      lastIndex: this.status.lastIndex,
      from: this.status.from,
      foundFriend: this.foundFriend,
      tribute,
      index,
      juIndex,
      stateData,
      status,
    }
  }

  teamWorkGameOver() {
    const playersInWinOrder = this.players.slice().sort((p1, p2) => p1.winOrder - p2.winOrder);
    const teamOrder = playersInWinOrder.map(p => p.team);
    const winTeam = teamOrder[0];

    let upgradeMultiple = 1;
    let upgradeScore = 1;
    if (teamOrder[0] === teamOrder[1]) {
      upgradeMultiple = (this.rule.upgrade === 1 ? 3 : 4);
      upgradeScore = 4;
    }

    if (teamOrder[0] === teamOrder[2]) {
      upgradeMultiple = 2;
      upgradeScore = 2;
    }

    this.room.upgradeMultiple = upgradeMultiple;
    this.room.upgradeScore = upgradeScore;

    this.room.winTeamPlayers = this.players.filter(p => p.team === winTeam).map(p => p.seatIndex);
    this.room.loseTeamPlayers = this.players.filter(p => p.team !== winTeam).map(p => p.seatIndex);

    // console.warn("score %s winTeamPlayers %s loseTeamPlayers %s", upgradeMultiple, JSON.stringify(this.room.winTeamPlayers), JSON.stringify(this.room.loseTeamPlayers));
  }

  async gameOver() {
    if (this.state === 'gameOver') {
      return
    }

    this.state = 'gameOver';

    if (this.mode === 'teamwork') {
      this.teamWorkGameOver();
    }

    // 计算金豆
    await this.recordRubyReward();
    const states = [];
    for (const p of this.players) {
      states.push({
        model: p.model,
        index: p.index,
        score: p.balance,
        winOrder: p.winOrder
      })
    }
    const gameOverMsg = {
      states,
      juShu: this.restJushu,
      isPublic: this.room.isPublic,
      juIndex: this.room.game.juIndex,
      gameType: GameType.guandan,
      mode: this.mode,
      homeTeam: this.homeTeamPlayers().map(p => p.index),
      awayTeam: this.awayTeamPlayers().map(p => p.index),
      creator: this.room.creator.model._id,
    }
    this.room.broadcast('game/gameOverReply', {ok: true, data: gameOverMsg});
    this.stateData.gameOver = gameOverMsg;
    const firstPlayer = this.players.slice().sort((p1, p2) => p1.winOrder - p2.winOrder)[0];
    await this.roomGameOver(states, firstPlayer._id);
  }

  destroy() {
    super.destroy()
    this.state = 'gameOver';
  }

  // 记录金豆
  async recordRubyReward() {
    if (!this.room.isPublic) {
      // 计算好友房分数
      for (let i = 0; i < this.players.length; i++) {
        const p = this.players[i];
        if (p) {
          const base = this.room.winTeamPlayers.includes(p.seatIndex) ? 1 : -1;
          // 基础倍率
          p.balance = base * this.multiple * this.room.upgradeScore;
        }
      }

      return null;
    }

    // 金豆房记录奖励
    await this.getBigWinner();
  }
  async getBigWinner() {
    const conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.room.gameRule.categoryId);
    let times = conf.base * conf.Ante;
    let winRuby = 0;
    let lostRuby = 0;
    let maxBalance = 0;
    let maxLostBalance = 0;
    const winnerList = [];
    const lostList = [];
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (p) {
        const base = this.room.winTeamPlayers.includes(p.seatIndex) ? 1 : -1;
        // console.warn("index %s base %s times %s", p.seatIndex, base, times);
        // 基础倍率
        p.balance = base * times * this.multiple * this.room.upgradeScore;

        if (p.balance > 0) {
          const currency = await this.PlayerGoldCurrency(p._id);
          if (p.balance > currency) {
            // console.warn("winner balance-%s currency-%s", p.balance, currency);
            p.balance = currency;
          }

          winnerList.push(p);
          winRuby += p.balance;
          maxBalance += p.balance;
        } else {
          const currency = await this.PlayerGoldCurrency(p._id);
          if (currency < -p.balance) {
            // console.warn("loser balance-%s currency-%s", p.balance, currency);
            p.balance = -currency;
          }

          lostList.push(p);
          maxLostBalance += p.balance;
          lostRuby += p.balance;
        }
      }
    }

    if (winRuby > -lostRuby) {
      winRuby = -lostRuby;
    }

    if (-lostRuby > winRuby) {
      lostRuby = -winRuby;
    }

    if (isNaN(winRuby)) {
      winRuby = 0;
    }
    if (isNaN(lostRuby)) {
      lostRuby = 0;
    }

    console.log('win ruby', winRuby, 'lost ruby', lostRuby, 'maxBalance', maxBalance, 'maxLostBalance', maxLostBalance);

    if (winRuby > 0) {
      for (const p of winnerList) {
        const oldBalance = p.balance;
        p.balance = Math.floor(p.balance / maxBalance * winRuby);
        console.log('winner after balance %s oldBalance %s shortId %s', p.balance, oldBalance, p.model.shortId)
      }
    }

    if (lostRuby < 0) {
      for (const p of lostList) {
        const oldBalance = p.balance;
        p.balance = Math.floor(p.balance / maxLostBalance * lostRuby);
        console.log('lost after balance %s oldBalance %s shortId %s', p.balance, oldBalance, p.model.shortId)
      }
    }
  }

  // 根据币种类型获取币种余额
  async PlayerGoldCurrency(playerId) {
    const model = await service.playerService.getPlayerModel(playerId);

    if (this.rule.currency === Enums.goldCurrency) {
      return model.gold;
    }

    return model.tlGold;
  }
};
