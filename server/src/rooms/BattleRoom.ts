import { Room, Client } from "colyseus";
import { BattleRoomState } from "./schema/BattleRoomState";
import { Body } from "./schema/Body";

import { START_POSITION } from "./schema/constants";
import { Message } from "./schema/message";

export class BattleRoom extends Room<BattleRoomState> {
  lastUpdate: number = 0;

  onCreate (options: any) {
    this.maxClients = 8;
    this.setState(new BattleRoomState(this));

    // Send start message when game starts
    this.onMessage("start", this.handleStart);
    // Send move command when player moves
    this.onMessage("move", this.handleMovement);
    // Send this when a player starts a meeting
    this.onMessage("meeting", this.handleMeeting);
    // Send a dispatch command when yo throw a weapon in a trashcan
    this.onMessage("dispatch", this.handleDispatch);
    // Send a release when releasing a trapped weapon
    this.onMessage("release", this.handleRelease);
    // Send a pick command when you want to collect a weapon
    this.onMessage("pick", this.handlePick);
    // Send an attack command when a player attacks another
    this.onMessage("attack", this.handleAttack);
    // Send a chat message when on chat
    this.onMessage("chat", this.handleChat);
    // Send a vote message when a character casts a vote
    this.onMessage("vote", this.handleVote);

    this.clock.setInterval(() => {
      const now = new Date().getTime();
      const dt = this.lastUpdate ? now - this.lastUpdate : 1;
      this.lastUpdate = now;
      this.onClockUpdate(dt);
    }, 1000 / 60);
  }

  handleStart = (client: Client, message: any) => {
    console.log('trying to start');
    const player = this.state.playerOf(client);
    // Only start game if on lobby
    if (!this.state.onLobby()) {
      console.log('not on lobby baby');
      return;
    }

    // Only allow the leader to start the game
    if (!player) {
      console.log('no player');
      return;
    }
    // if (!player.leader) return;

    // Can't start without 5 or more players
    if (this.state.onlinePlayers.length < 5) return;

    this.state.startGame();
  };

  handleMeeting = (client: Client) => {
    const player = this.state.playerOf(client);
    if (!player) return;
    if (!this.state.canStartMeeting(player)) return;

    this.state.startMeeting();
    this.broadcast('meeting', { id: player.id });
  };

  handleMovement = (client: Client, message: any) => {
    const player = this.state.playerOf(client);

    if (!player) return;
    if (!this.state.allowsMovement()) return;
    if (!message) return;

    const { x, y } = message;

    if (typeof x !== 'number' || typeof y !== 'number') return

    player.move(this.state.map, x, y);
    console.log('moved');
  };

  handleDispatch = (client: Client, message: any) => {
    const player = this.state.playerOf(client);
    if (!player) return;

    this.state.dispatchWeapon(player);
  };

  handleRelease = (client: Client, message: any) => {
    const player = this.state.playerOf(client);
    if (!player) return;

    const weapon = player.findWeapon();
    if (!weapon) return;

    weapon.trapped = false;
  };

  handlePick = (client: Client, message: any) => {
    const player = this.state.playerOf(client);
    if (!player) return;

    const weapon = player.findWeapon();
    if (!weapon) return;
    if (weapon.trapped) return;
    if (player.weapon) return;

    this.state.pickWeapon(player, weapon);
  };

  handleAttack = (client: Client, message: any) => {
    if (!message) return;
    const { id } = message;
    const player = this.state.playerOf(client);
    const target = this.state.playerById(id);
    if (!player || !target) return;
    if (player === target) return;
    if (!player.weapon) return;
    if (!player.canKill(target)) return;
    if (this.state.map.isBlocked(player.position, target.position)) return;

    player.kill(target);
    if (target.weapon) {
      // Throw weapon on the floor when dying
      target.weapon.position.set(target.position.x, target.position.y);
      this.state.weapons.push(target.weapon);
    }
    this.state.bodies.push(new Body(target));
  };

  handleVote = (client: Client, message: any) => {
    const player = this.state.playerOf(client);

    if (!player) return;
    if (!this.state.onMeeting()) return;
    if (!message) return;

    const { id } = message;
    if (typeof id !== 'string') return;

    const target = this.state.playerById(id);
    if (!target) return;

    player.vote(target);
    this.broadcast('voted',  {
      player: player.id,
      target: target.id,
    });
  };

  handleChat = (client: Client, message: any) => {
    const player = this.state.playerOf(client);
    if (!player) return;
    if (!message) return;
    if (typeof message !== 'string') return;

    this.state.chat.push(new Message(player, message));
  };

  onClockUpdate = (dt: number) => {
    this.state.update(dt);
  };

  onAuth(client: Client, data: any) {
    const player = this.state.playerOf(client);
    // Limit it up to 8 characters
    if (this.state.players.length > this.maxClients) return false;
    // Users can only join on the lobby
    if (!this.state.onLobby()) return false;
    // A player can't join twice
    if (player) return false;
    // You require a name to join
    if (!data && !data.name) return false;
    // And the name must be a string
    if (typeof data.name !== 'string') return false;
    // And it must be between 1 and 16 characters
    if (data.name.length < 1 || data.name.length >= 16) return false;

    this.state.addPlayer(client, data.name);
    return true;
  }

  onJoin(client: Client, options: any) {
    console.log('player joined');
    const player = this.state.playerOf(client);
    if (!player) return;
    player.position.set(START_POSITION[0], START_POSITION[1]);
    this.broadcast('join', player);
  }

  onLeave(client: Client, consented: boolean) {
    console.log('player left');
    const player = this.state.playerOf(client);
    if (!player) return;

    this.state.removePlayer(player);
    this.broadcast('leave', player);
  }

  onDispose() {
    this.clock.clear();
  }

}
