'use strict';

const colors = {
  background:    '#d8d89a',
  boardbg1:      '#8bc34a',
  boardbg2:      '#d6af5c',
  boardlines:    '#795548',

  invader:       '#ff1744',
  invaderhp:     '#00ff00',
  invaderdmg:    '#ff0000',
  invaderstun:   '#00bcd4',

  turret:        '#673ab7',
  stunner:       '#82b1ff',
  bomb:          '#263238',
  towercooldown: '#00bcd4',
  rangeoverlay:  'rgba(255, 59, 00, 0.5)',
  rangeoutline:  '#ff0000',

  lowlife:       '#c1180c',

  text:          '#000000',
}

const INITIAL_GOLD             = 500;
const INITIAL_LIFE             = 100;
const INITIAL_INCOME           = 10;
const INITIAL_MAXBOOST         = 0;
const INCOME_INTERVAL          = 10;
const INCOME_INCREASE_INTERVAL = 100;

const MAX_GAME_LEN = 100000;
const LOW_LIFE_THRESHOLD = 15;

const BASE_HP   = 10;
const BASE_COST = 10;
const DEF_COST  = 10;
const RES_COST  = 10;
const KILL_GOLD_RATIO = 0.1;
const INVADE_GOLD_RATIO = 1.5;

const BUILD_COST        = 100;
const BUILD_TIME        = 10;
const UPGRADE_COST      = 100;
const UPGRADE_TIME      = 10;
const BOMB_COOLDOWN     = 5;
const VALID_TOWER_TYPES = ['turret', 'bomb', 'stunner'];


const LEFT  = 0;
const RIGHT = 1;

class Invader {
  constructor(hp, defense, stunRes) {
    this.pos      = 0;
    this.hp       = hp;
    this.maxhp    = hp;
    this.defense  = defense || 0;
    this.stunRes  = stunRes || 0;
    this.stunTime = 0;
  }

  damage(power) {
    this.hp -= Math.max(power - this.defense, 1);
    return this.hp <= 0; // return true if it should die
  }

  stun(power) {
    this.stunTime = Math.max(power - this.stunRes, 0);
  }

  killReward() {
    return (this.maxhp + DEF_COST * this.defense + RES_COST * this.stunRes) * KILL_GOLD_RATIO | 0;
  }

  invadeReward() {
    return this.hp * INVADE_GOLD_RATIO | 0;
  }
}

class Tower {
  constructor(type, pos) {
    this.level    = 0;
    this.pos      = pos;
    this.power    = 1;
    this.range    = 1;
    this.cooldown = BUILD_TIME;
    this.type     = type;
    switch (type) {
      case 'bomb':
        this.range = 2;
        break;
      case 'stunner':
        this.range = 0;
        break;
    }
  }

  upgrade(stat) {
    switch (stat) {
      case 'power':
      case 'range':
        this.level++;
        this[stat]++;
        this.cooldown = UPGRADE_TIME;
      default:
    }
  }
}

class Board {
  constructor(side) {
    this.side = side;
    this.invaders = new Array(100);
    this.towers   = new Array(100);
  }

  step() {
    let goldEarned = 0;
    let invaded = 0;
    // Attack invaders
    for (let tower of this.towers) {
      if (!tower) continue;
      if (tower.cooldown) {
        tower.cooldown--;
        continue;
      }
      switch (tower.type) {
        case 'turret':
          for (let i = tower.pos + tower.range; i >= tower.pos - tower.range; i--) {
            let invader = this.invaders[i];
            if (invader) {
              if (invader.damage(tower.power)) {
                this.invaders[i] = null;
                goldEarned += invader.killReward();
              }
              break;
            }
          }
          break;
        case 'stunner':
          for (let i = tower.pos + tower.range; i >= tower.pos - tower.range; i--) {
            if (this.invaders[i] && this.invaders[i].stunTime === 0) {
              this.invaders[i].stun(tower.power);
              tower.cooldown = tower.power + 1;
              break;
            }
          }
          break;
        case 'bomb':
          if (this.invaders[tower.pos]) { // Only explodes if there is an invader immediately in front of it
            for (let i = tower.pos - tower.range; i <= tower.pos + tower.range; i++) {
              if (this.invaders[i]) {
                if (this.invaders[i].damage(tower.power)) {
                  this.invaders[i] = null;
                  goldEarned += invader.killReward();
                }
                tower.cooldown = BOMB_COOLDOWN;
              }
            }
          }
          break;
      }
    }
    // Move invaders
    for (let i = 99; i >= 0; i--) {
      let invader = this.invaders[i];
      if (invader) {
        if (invader.stunTime > 0) {
          invader.stunTime--;
          continue;
        }
        if (!this.invaders[i + 1]) {
          this.invaders[i] = null;
          if (i === 99) {
            invaded = invader.invadeReward();
          }
          else {
            this.invaders[++invader.pos] = invader;
          }
        }
      }
    }

    return {
      goldEarned: goldEarned,
      invaded:    invaded
    }
  }
}

function player(name) {
  return {
    gold:     INITIAL_GOLD,
    income:   INITIAL_INCOME,
    boostMax: INITIAL_MAXBOOST,
    life:     INITIAL_LIFE,
  }
}

class Game {
  constructor(leftName, leftBot, rightName, rightBot) {
    this.turnNumber = 0;
    this.gameOver = false;

    this.boards  = [new Board(LEFT), new Board(RIGHT)];
    this.players = [player(), player()];
    this.bots    = [leftBot, rightBot];

    this.canvas = document.getElementById('viewport');
    this.canvasContext = this.canvas.getContext('2d');

    this.hud = {
      turnNumber: document.getElementById('turn-number'),
      hoverStats: document.getElementById('hover-stats'),
      players: [
        {
          name:   document.getElementById('left-name'),
          gold:   document.getElementById('left-gold'),
          income: document.getElementById('left-income'),
          boost:  document.getElementById('left-boost'),
          life:   document.getElementById('left-life'),
        },
        {
          name:   document.getElementById('right-name'),
          gold:   document.getElementById('right-gold'),
          income: document.getElementById('right-income'),
          boost:  document.getElementById('right-boost'),
          life:   document.getElementById('right-life'),
        }
      ]
    }
    this.hoverPlaceholder = this.hud.hoverStats.innerHTML;
    this.hud.players[LEFT].name.innerText  = leftName;
    this.hud.players[RIGHT].name.innerText = rightName;

    this.selectedEntity = null;
    this.selectedIndex = null;
    this.selectedType = null;

    this.frameQueued = null;

    let self = this;
    this.canvas.addEventListener("mousemove", function(event) {
      let x = event.clientX - self.canvas.offsetLeft;
      let y = event.clientY - self.canvas.offsetTop;

      let yCenter = self.canvas.height / 2;
      let spaceSize = 12;
      let leftEdge = 40;

      let spaceIndex = (x - leftEdge) / spaceSize | 0;
      if (spaceIndex >= 0 && spaceIndex < 100) {
        if (y < yCenter && y >= yCenter - spaceSize * 3) {
          self.selectedIndex = spaceIndex;
          self.selectedType = 'invader';
        }
        else if (y >= yCenter && y < yCenter + spaceSize * 3) {
          self.selectedIndex = spaceIndex;
          self.selectedType = 'tower';
        }
        else {
          self.selectedIndex = null;
          self.selectedType = null;
        }
      }

      self.updateHUD();
      self.queueDraw();
    });
  }

  spawnInvader(who, {hp, defense, stunRes, ..._}) {
    let board  = this.boards[who];
    let player = this.players[who];
    hp = Math.max(hp || 0, 0);
    defense = Math.max(defense || 0, 0);
    stunRes = Math.max(stunRes || 0, 0);
    let cost = BASE_COST + hp + defense * DEF_COST + stunRes * RES_COST;
    let totalBoost = hp + defense + stunRes;
    if (
      !board.invaders[0]
      && player.gold >= cost
      && totalBoost <= player.boostMax
    ) {
      let spawnHP = (BASE_HP + hp);
      let invader = new Invader(spawnHP, defense, stunRes);
      board.invaders[0] = invader;
      player.gold -= cost;
      return invader;
    }
  }

  buildTower(who, {type, pos, ..._}) {
    let board  = this.boards[1 - who];
    let player = this.players[who];
    if (
      pos != null && pos >= 0 && pos < 100 && !board.towers[pos]
      && type && VALID_TOWER_TYPES.includes(type)
      && player.gold >= BUILD_COST
    ) {
      let tower = new Tower(type, pos);
      board.towers[pos] = tower;
      player.gold -= BUILD_COST;
      return tower;
    }
  }

  upgradeTower(who, {pos, stat, ..._}) {
    let board  = this.boards[1 - who];
    let player = this.players[who];
    if (
      board.towers[pos]
      && (stat === 'power' || stat === 'range')
      && player.gold >= UPGRADE_COST
    ) {
      board.towers[pos].upgrade(stat);
      player.gold -= UPGRADE_COST;
    }
  }

  destroyTower(who, {pos, ..._}) {
    let board  = this.boards[1 - who];
    let player = this.players[who];
    if (board.towers[pos]) {
      let tower = board.towers[pos];
      board.towers[pos] = null;
      player.gold += (BUILD_COST + UPGRADE_COST * tower.level) / 2 | 0;
    }
  }

  step() {
    if (this.gameOver) return;

    for (let board of this.boards) {
      let result = board.step();
      this.players[1 - board.side].gold += result.goldEarned;
      this.players[board.side].gold += result.invaded;
      if (result.invaded) {
        this.players[1 - board.side].life -= 1;
      }
    }

    this.turnNumber++;
    if (this.turnNumber % INCOME_INTERVAL == 0) {
      for (let player of this.players) {
        player.gold += player.income;
      }
    }
    if (this.turnNumber % INCOME_INCREASE_INTERVAL == 0) {
      for (let player of this.players) {
        player.income   += Math.log10(this.turnNumber) - 1 | 0;
        player.boostMax += Math.log10(this.turnNumber)     | 0;
      }
    }

    for (let me = 0; me < 2; me++) {
      let notme = 1 - me;
      let action = this.bots[me](
        this.turnNumber,
        this.players[me],
        this.players[notme],
        this.boards[me],     // Attacking
        this.boards[notme],  // Defending
      );
      if (action) {
        switch (action.action) {
          case 'spawn':
            this.spawnInvader(me, action);
            break;
          case 'build':
            this.buildTower(me, action);
            break;
          case 'upgrade':
            this.upgradeTower(me, action);
            break;
          case 'destroy':
            this.destroyTower(me, action);
            break;
          default:
            break;
        }
      }
    }

    this.updateHUD();

    if (
      this.turnNumber >= MAX_GAME_LEN
      || this.players[0].life <= 0
      || this.players[1].life <= 0
    ) {
      this.gameOver = true;
    }
    return !this.gameOver;
  }

  queueDraw() {
    let self = this;
    window.requestAnimationFrame(() => self.draw());
  }

  draw() {
    this.canvasContext.fillStyle = colors.background;
    this.canvasContext.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.drawSide(this.canvas.height * 0.25 | 0, this.boards[0], false);
    this.drawSide(this.canvas.height * 0.75 | 0, this.boards[1], true);
  }

  drawSide(boardCenter, board, mirror) {
    let ctx = this.canvasContext;

    let yCenter = this.canvas.height / 2;
    let spaceSize = 12;
    let halfSpace = spaceSize / 2;
    let leftEdge = 40;
    let barWidth = spaceSize / 3;
    let hpBarHeight = 40;
    let pieceRadius = 4;
    let heightPerStun = 4;
    let heightPerCooldown = 4;
    let barPadding = 2;
    let pieceXCenterBase = leftEdge + halfSpace;

    ctx.fillStyle = colors.boardbg1;
    for (let i = 0; i < 10; i += 2) {
      ctx.fillRect(
        leftEdge + 10 * spaceSize * i,
        boardCenter - spaceSize,
        10 * spaceSize,
        spaceSize
      );
    }
    ctx.fillStyle = colors.boardbg2;
    for (let i = 1; i < 10; i += 2) {
      ctx.fillRect(
        leftEdge + 10 * spaceSize * i,
        boardCenter - spaceSize,
        10 * spaceSize,
        spaceSize
      );
    }
    ctx.strokeStyle = colors.boardlines;
    for (let i = 0; i < 100; i ++) {
      ctx.strokeRect(
        leftEdge + spaceSize * i,
        boardCenter - spaceSize,
        spaceSize,
        spaceSize
      )
    }

    for (let i = 0; i < 100; i ++) {
      let gridPos = mirror? 99 - i : i;
      let invader = board.invaders[i];
      if (invader) {
        ctx.fillStyle = colors.invader;
        ctx.beginPath();
        ctx.arc(
          pieceXCenterBase + spaceSize * gridPos,
          boardCenter - halfSpace,
          pieceRadius,
          0, 2*Math.PI
        );
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = colors.invaderdmg;
        ctx.fillRect(
          pieceXCenterBase - barWidth + spaceSize * gridPos,
          boardCenter - spaceSize - barPadding - hpBarHeight,
          barWidth,
          hpBarHeight
        );
        ctx.fillStyle = colors.invaderhp;
        let pixhp = hpBarHeight * (invader.hp / invader.maxhp);
        ctx.fillRect(
          pieceXCenterBase - barWidth + spaceSize * gridPos,
          boardCenter - spaceSize - barPadding - pixhp,
          barWidth,
          pixhp
        );
        ctx.fillStyle = colors.invaderstun;
        ctx.fillRect(
          pieceXCenterBase + spaceSize * gridPos,
          boardCenter - spaceSize - barPadding - invader.stunTime * heightPerStun,
          barWidth,
          invader.stunTime * heightPerStun
        );
      }

      let tower = board.towers[i];
      if (tower) {
        ctx.fillStyle = colors[tower.type]
        ctx.beginPath();
        ctx.arc(
          pieceXCenterBase + spaceSize * gridPos,
          boardCenter + halfSpace,
          pieceRadius,
          0, 2*Math.PI
        );
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = colors.towercooldown;
        ctx.fillRect(
          pieceXCenterBase - barWidth / 2 + spaceSize * gridPos,
          boardCenter + spaceSize + barPadding,
          barWidth,
          tower.cooldown * heightPerCooldown
        );
      }
    }

    if (this.selectedEntity instanceof Tower) {
      let tower = this.selectedEntity;
      let rangeLeftX = Math.max(tower.pos - tower.range, 0);
      let rangeRightX = Math.min(tower.pos + tower.range + 1, 100);
      ctx.fillStyle = colors.rangeoverlay;
      ctx.strokeStyle = colors.rangeoutline;
      ctx.fillRect(
        leftEdge + rangeLeftX * spaceSize,
        boardCenter - spaceSize,
        (rangeRightX - rangeLeftX) * spaceSize,
        spaceSize,
      )
      ctx.strokeRect(
        leftEdge + rangeLeftX * spaceSize,
        boardCenter - spaceSize,
        (rangeRightX - rangeLeftX) * spaceSize,
        spaceSize,
      )
    }
  }

  updateHUD() {
    // switch (this.selectedType) {
    //   case 'invader':
    //     this.selectedEntity = this.invaders[this.selectedIndex];
    //     break;
    //   case 'tower':
    //     this.selectedEntity = this.towerSlots[this.selectedIndex];
    //     break;
    //   default:
    //     this.selectedEntity = null;
    //     break;
    // }
    //
    if (this.selectedEntity) {
      // TODO: make a table or something prettier and more intelligent
      this.hud.hoverStats.innerText = JSON.stringify(this.selectedEntity);
    }
    else {
      // TODO: make this not use innerHTML and cache DOM nodes or something...
      this.hud.hoverStats.innerHTML = this.hoverPlaceholder;
    }

    this.hud.turnNumber.innerText    = this.turnNumber;
    for (let i = 0; i < 2; i++) {
      let hud = this.hud.players[i];
      let player = this.players[i];
      hud.gold.innerText = player.gold;
      hud.income.innerText = player.income;
      hud.boost.innerText = player.boostMax;
      hud.life.innerText = player.life;
      if (player.life <= LOW_LIFE_THRESHOLD) {
        hud.life.style.color = colors.lowlife;
      }
    }
  }

  run() {
    let game = this;

    let delay = document.getElementById('turn-delay');
    let pause = document.getElementById('pause-btn');
    let step = document.getElementById('step-btn');

    // Scoping rules with callbacks are weird...
    let runState = {
      turnTimeout: null,
      running:     false,
    };

    function turn() {
      if (runState.running) {
        runState.turnTimeout = window.setTimeout(turn, parseInt(delay.value));
      }
      if (!game.step()) {
        pauseAction();
      }
      game.queueDraw();
    }

    function resumeAction() {
      runState.running = true;
      pause.onclick = pauseAction;
      pause.value = 'Stop';
      turn();
    }

    function pauseAction() {
      if (runState.turnTimeout) {
        window.clearTimeout(runState.turnTimeout)
      }
      runState.running = false;
      pause.onclick = resumeAction;
      pause.value = 'Start';
    }

    function stepAction() {
      pauseAction();
      game.step();
      game.queueDraw();
    }

    pauseAction();
    step.onclick = stepAction;

    this.queueDraw();
  }
}

function simpleTurretBuilder() {
  let pos = 10;
  let built = 0;
  return function decideAction(turnNumber, me, notme, attacking, defending) {
    if (built < 100) {
      if (me.gold >= BUILD_COST) {
        let action = {action: 'build', pos: pos, type: 'turret'};
        pos = (pos + 1) % 100;
        built ++;
        if (built == 100) {
          pos = 0;
        }
        return action;
      }
    }
    else {
      if (me.gold >= UPGRADE_COST) {
        let action = {action: 'upgrade', pos: pos, stat: 'power'};
        pos = (pos + 1) % 100;
        return action;
      }
    }
  }
}

function simpleInvaderArmy() {
  return function decideAction(turnNumber, me, notme, attacking, defending) {
    // console.log(turnNumber, me, notme, attacking, defending)
    // console.log(me.gold, BASE_COST, me.boostMax, me.gold >= BASE_COST + me.boostMax)
    if (me.gold >= BASE_COST + me.boostMax) {
      return {action: 'spawn', hp: me.boostMax};
    }
  }
}

function newGame() {
  let game = new Game(
    "Placeholder (left)", simpleInvaderArmy(),
    "Placeholder (right)", simpleInvaderArmy()
  );
  game.run()
}

document.addEventListener('DOMContentLoaded', newGame, false);
