import { Client } from "colyseus";
import { Schema, type } from "@colyseus/schema";

import { BattleRoomState } from "./BattleRoomState";
import { Player } from "./Player";

export class Message extends Schema {
  // Player id of the sender
  @type("string")
  id: string;

  // Text sent on message
  @type("string")
  message: string;

  // If the user was alive at the time of sending it
  @type("boolean")
  alive: boolean;

  constructor(player: Player, message: string) {
    super();
    this.id = player.id;
    this.message = message;
    this.alive = player.alive;
  }

  isVisible(state: BattleRoomState, client: Client) {
    const player = state.playerOf(client);
    if (!player) return false;

    return player.dead || player.alive === this.alive;
  }
}
