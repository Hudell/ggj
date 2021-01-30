import { Client, Room } from "colyseus";
import { Schema, type, filter, ArraySchema, filterChildren } from "@colyseus/schema";

import { START_POSITION, VOTING_TIME } from "./constants";

import { Body } from "./Body";
import { Player } from "./Player";
import { Point } from "./Point";
import { Trashcan } from "./Trashcan";
import { Lobby, Map } from "./Map";
import { Message } from "./message";
import { Color, COLORS } from "./Color";
import { Weapon } from "./Weapon";

export class BattleRoomState extends Schema {
  // The current phase of the game
  @type('string')
  phase: 'lobby'|'map'|'meeting'|'victory'|'defeat'|'startingMap'|'ejecting';

  // A list of weapon dispatch positions
  @type([Point])
  trashcans: ArraySchema<Trashcan>;

  // Current players on the map
  @type([Player])
  players: ArraySchema<Player>;

  // Current weapons on the map
  @type([Weapon])
  weapons: ArraySchema<Weapon>;

  // A list of player id of traitors, kept separated to filter them
  @filter((client, _, state: BattleRoomState) => state.onGameOver() || state.isTraitor(client))
  @type(["string"])
  traitors: ArraySchema<string>;

  // Current chat of the game
  @filterChildren((c: Client, _, m: Message, s: BattleRoomState) => m.isVisible(s, c))
  @type([Message])
  chat: ArraySchema<Message>;

  // The current selected map (1 for the GGJ but it is kept for future use)
  @type(Map)
  map: Map;

  // Bodies of killed players on the map
  @type([Body])
  bodies: ArraySchema<Body>

  room: Room;

  constructor(room: Room) {
    super();
    this.room = room;
    this.phase = 'lobby';
    this.map = new Lobby();
    this.trashcans = new ArraySchema();
    this.players = new ArraySchema();
    this.traitors = new ArraySchema();
    this.weapons = new ArraySchema();
    this.chat = new ArraySchema();
    this.bodies = new ArraySchema();
  }

  dispatchWeapon(player: Player) {
    // Do not throw weapon if player isn't alive
    if (!player.alive) return false;
    // Can't throw weapon if player doesn't have any
    if (!player.weapon) return false;

    // Search if the player has a trashcan close enough
    for (let trashcan of this.trashcans) {
      if (player.isNear(trashcan.position)) {
        trashcan.weapons.push(player.weapon);
        player.weapon = null;
        this.checkGameOver();
        return true;
      }
    }

    return false;
  }

  playerOf(client: Client) {
    return this.players.find(i => i.client.id === client.id);
  }

  playerById(id: string) {
    return this.players.find(i => i.id === id);
  }

  isTraitor(client: Client) {
    return Boolean(this.traitors.includes(client.id));
  }

  onLobby() {
    return this.phase === 'lobby';
  }

  onMeeting() {
    return this.phase === 'meeting';
  }

  onMap() {
    return this.phase === 'map';
  }

  allowsMovement() {
    return ['lobby', 'map'].includes(this.phase);
  }

  onGameOver() {
    return ['victory', 'defeat'].includes(this.phase);
  }

  startGame() {
    this.map = new Map();
    this.map.setup(this);
    this.pickTraitors();
    this.phase = 'startingMap';
    this.room.clock.setTimeout(() => {
      if (!this.map) return;
      this.phase = 'map';
      this.room.broadcast('loadMap', { mapId: this.map.id });
    }, 5000);
  }

  pickTraitors() {
    const players = this.onlinePlayers;
    let amount = 1;
    if (players.length > 7) {
      amount = 2;
    }

    const traitors = [];

    for (let _ = 0; _ < amount; ++_) {
      let i = Math.floor(Math.random() * players.length);
      let player = players[i];
      while (player.traitor)
      {
        i = Math.floor(Math.random() * players.length);
        player = players[i];        
      }
      this.traitors.push(player.id);
      traitors.push(player.id);
    }
    for (const player of players) {
      if (player.traitor) {
        player.client.send('start', { role: 'traitor', traitors });
      } else {
        player.client.send('start', { role: 'ally', traitors: traitors.length });
      }
    }
  }

  addPlayer(client: Client, name: string) {
    const color = this.findFreeColor();
    const player = new Player(this, client, name, color);
    player.leader = this.players.length === 0;
    this.players.push(player);
  }

  removePlayer(player: Player) {
    const i = this.onlinePlayers.indexOf(player);
    if (i < 0) return;

    // Remove the player from the list
    player.online = false;

    const onlinePlayers = this.onlinePlayers;

    // Check if player is on Lobby or game over screen, remove it from game
    if (this.onLobby() || this.onGameOver()) {
      const i = this.players.indexOf(player);
      if (i >= 0) {
        this.players.splice(i, 1);
      }
    }

    // If it was the leader, assign a new leader
    if (onlinePlayers.length && player.leader) {
      onlinePlayers[0].leader = true;
    }

    this.checkGameOver();
  }

  checkGameOver() {
    // You can only game over on a map
    if (this.phase !== 'map' && this.phase !== 'meeting') return false;

    if (this.noMoreWeapons()) {
      this.startVictory();
      return true;
    }

    if (this.allEnemiesDead()) {
      this.startVictory();
      return true;
    }

    if (this.allAlliesDead()) {
      this.startDefeat();
      return true;
    }

    return false;
  }

  noMoreWeapons() {
    return this.weapons.length === 0 && this.alivePlayers.every(i => !i.weapon || i.weapon.broken);
  }

  canStartMeeting(player: Player) {
    if (!this.onMap()) return;

    return this.map.meetingButton.canBeTouchedBy(player) || player.nearBody;
  }

  allEnemiesDead() {
    return this.enemies.every(i => i.dead);
  }

  allAlliesDead() {
    return this.allies.every(i => i.dead);
  }

  startVictory() {
    this.room.broadcast('victory');
    this.phase = 'victory';
    this.room.clock.setTimeout(() => this.restartLobby(), 20_000);
  }

  startDefeat() {
    this.room.broadcast('defeat');
    this.phase = 'defeat';
    this.room.clock.setTimeout(() => this.restartLobby(), 20_000);
  }

  startMeeting() {
    for (const player of this.players) {
      player.startMeeting();
    }
    this.map.setupPlayers(this.players);
    this.phase = 'meeting';
    this.room.clock.setTimeout(this.endMeeting, VOTING_TIME);
  }

  endMeeting = () => {
    this.phase = 'ejecting';
    const players = this.electEjectCandidates();

    if (players.length === 1) {
      const player = players[0];
      player.alive = false;
      this.room.broadcast('ejected', { playerId: player.id });
    } else {
      this.room.broadcast('ejected', { playerId: null });
    }
    this.room.clock.setTimeout(this.resumeMap, 10_000);
  };

  electEjectCandidates = () => {
    const maxVotes = Math.max(...this.alivePlayers.map(i => i.votes.length));
    return this.alivePlayers.filter(i => i.votes.length === maxVotes);
  };

  resumeMap = () => {
    if (this.checkGameOver()) return;

    this.phase = 'map';
    this.room.broadcast('endMeeting');
  };

  restartLobby() {
    this.phase = 'lobby';
    this.map = new Lobby();
    this.map.setup(this);
    this.chat.splice(0, this.chat.length);
    this.bodies.splice(0, this.bodies.length);
    // Remove online players on restart
    for (let i = this.players.length - 1; i >= 0; --i) {
      const player = this.players[i];
      if (!player.online) {
        this.players.slice(i, 1);
      }
    }
    this.room.broadcast('toLobby');
  }

  findFreeColor(): Color {
    const color = COLORS.find(i => this.players.every(p => p.color !== i));
    if (!color) throw new Error("Couldn't find free color");
    return color;
  }

  pickWeapon(player: Player, weapon: Weapon) {
    const i = this.weapons.indexOf(weapon);

    this.weapons.splice(i, 1);
    player.weapon = weapon;
    player.client.send('picked', { weapon });
  }

  update(dt: number) {
    for (const p of this.players) {
      p.update(dt);
    }
    this.checkGameOver();
  }

  get leader() {
    return this.onlinePlayers.find(i => i.leader);
  }

  get onlinePlayers(): Player[] {
    return this.players.filter(i => i.online);
  }

  get enemies(): Player[] {
    return this.players.filter(i => i.traitor);
  }

  get allies(): Player[] {
    return this.players.filter(i => !i.traitor);
  }

  get alivePlayers(): Player[] {
    return this.players.filter(i => i.alive);
  }
}