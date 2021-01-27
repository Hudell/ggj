import { Client } from "colyseus";
import { Schema, ArraySchema, type } from "@colyseus/schema";

import { Point } from "./Point";
import { Color } from "./Color";
import { Weapon } from "./Weapon";

import { TILE_SIZE, START_POSITION, MAX_MOVE_DISTANCE, MOVE_TIME, REPORT_DISTANCE } from "./constants";
import { BattleRoomState } from "./BattleRoomState";
import { Map } from "./Map";

export class Player extends Schema {
  client: Client;

  @type('string')
  id: string;

  @type('string')
  name: string;

  @type('string')
  color: Color;

  @type("boolean")
  alive: boolean;

  @type(Point)
  position: Point;

  @type(Weapon)
  killedBy: Weapon | null;

  @type(Weapon)
  weapon: Weapon | null;

  @type("boolean")
  leader: boolean;

  @type("boolean")
  online: boolean;

  // Voting status

  @type(["string"])
  votes: ArraySchema<string>;

  @type("boolean")
  voted: boolean;

  // Movement info

  moveStart: Point;
  moveTarget: Point;
  moveTime: number;

  // Handle to room state

  state: BattleRoomState;

  constructor(state: BattleRoomState, client: Client, name: string, color: Color) {
    super();
    this.id = client.id;
    this.state = state;
    this.client = client;
    this.name = name;
    this.color = color;
    this.alive = true;
    this.killedBy = null;
    this.weapon = null;
    this.leader = false;
    this.online = true;
    this.moveStart = new Point();
    this.moveTarget = new Point();
    this.moveTime = 0;
    this.voted = false;
    this.votes = new ArraySchema();

    this.position = new Point();
  }

  get dead() {
    return !this.alive || !this.online;
  }

  get tile() {
    return new Point(
      Math.floor(this.position.x / TILE_SIZE),
      Math.floor(this.position.y / TILE_SIZE)
    )
  }

  get traitor() {
    return this.state.isTraitor(this.client);
  }

  get moving() {
    return this.moveTime > 0;
  }

  get nearBody() {
    return this.state.bodies.some(i => this.isNear(i.position, REPORT_DISTANCE))
  }

  isNear(point: Point, distance = TILE_SIZE) {
    const x = point.x - this.position.x;
    const y = point.y - this.position.y;
    // Basic euclidean distance
    return Math.hypot(x, y) <= distance;
  }

  changeColor(color: Color) {
    // Only allow changing colors on lobby
    if (!this.state.onLobby()) return;
    // Don't allow the same color on two players
    if (this.state.players.some(i => i.color === color)) return;

    this.color = color;
  }

  reset() {
    this.position.set(START_POSITION[0], START_POSITION[1]);
    this.alive = true;
    this.weapon = null;
    this.killedBy = null;
  }

  move(map: Map, x: number, y: number) {
    const d = Math.hypot(x - this.position.x, y - this.position.y);
    if (d >= MAX_MOVE_DISTANCE) return;
    if (!map.isPassable(x, y)) return;

    this.moveStart.set(this.position.x, this.position.y);
    this.moveTarget.set(x, y);
    this.moveTime = MOVE_TIME;
  }

  update(dt: number) {
    if (this.moving) {
      this.moveTime -= dt;
      const t = 1 - Math.max(0, this.moveTime / MOVE_TIME);
      this.position.set(
        this.moveStart.x + (this.moveTarget.x - this.moveStart.x) * t,
        this.moveStart.y + (this.moveTarget.y - this.moveStart.y) * t
      )
    }
  }

  startMeeting() {
    this.votes.splice(0, this.votes.length);
    this.voted = false;
  }

  vote(player: Player) {
    if (this.dead) return;
    if (this.voted) return;

    player.votes.push(this.id);
    this.voted = true;
  }

  canKill(target: Player) {
    if (!this.weapon) return false;
    if (this.weapon.broken) return false;
    if (target.dead) return false;

    return this.isNear(target.position, this.weapon.range);
  }

  kill(target: Player) {
    if (!this.weapon) return;

    target.killedBy = this.weapon;
    this.weapon.broken = true;
  }

  findWeapon() {
    return this.state.weapons.find(i => this.isNear(i.position));
  }
}