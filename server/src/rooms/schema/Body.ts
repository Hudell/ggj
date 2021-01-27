import { Schema, type } from "@colyseus/schema";
import { Player } from "./Player";
import { Point } from "./Point";

export class Body extends Schema {
  @type("string")
  id: string;

  @type(Point)
  position: Point;

  constructor(player: Player) {
    super();
    this.id = player.id;
    this.position = new Point(player.position.x, player.position.y);
  }
}
