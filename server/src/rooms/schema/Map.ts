import { Schema, type } from "@colyseus/schema";
import { BattleRoomState } from "./BattleRoomState";
import { START_POSITION } from "./constants";
import { Player } from "./Player";
import { Point } from "./Point";
import { Trashcan } from "./Trashcan";
import { Weapon } from "./Weapon";

class MeetingButton extends Schema {
  @type(Point)
  position: Point;

  @type('boolean')
  active: boolean;

  constructor() {
    super();
    this.position = new Point();
    this.active = true;
  }

  canBeTouchedBy(player: Player) {
    return this.active && player.isNear(this.position);
  }
}

export class Map extends Schema {
  @type("int32")
  id: number;

  @type(MeetingButton)
  meetingButton: MeetingButton;

  constructor() {
    super();
    this.meetingButton = new MeetingButton();
    this.id = 1;
  }

  setup(state: BattleRoomState) {
    this.setupPlayers(state.players);
    this.setupWeapons(state.weapons);
    this.setupTrashcans(state.trashcans);
  }

  setupPlayers(players: Player[]) {}

  setupWeapons(weapons: Weapon[]) {
  }

  setupTrashcans(trashcans: Trashcan[]) {
  }

  isPassable(x: number, y: number) {
    // TODO: Check if position is passable on the real map
    return true;
  }

  // Checks if there is a wall between points
  isBlocked(p1: Point, p2: Point) {
    // TODO: Add wall collition
    return false;
  }
}

export class Lobby extends Map {
  setupPlayers(players: Player[]) {
    for (let player of players) {
      player.reset();
    }    
  }

  setupWeapons(weapons: Weapon[]) {
    weapons.splice(0, weapons.length);
  }

  setupTrashcans(trashcans: Trashcan[]) {
    trashcans.splice(0, trashcans.length);
  }

  isPassable(x: number, y: number) {
    return true;
  }

}
