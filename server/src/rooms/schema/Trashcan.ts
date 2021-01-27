import { Schema, type, ArraySchema } from "@colyseus/schema"
import { TILE_SIZE } from "./constants";

import { Point } from "./Point";
import { Weapon } from "./Weapon";

export class Trashcan extends Schema {

  // List of weapon throwed on the trashcan
  @type([ Weapon ])
  weapons: ArraySchema<Weapon>;

  // Position of the trashcan
  @type(Point)
  position: Point;

  constructor() {
    super();
    this.weapons = new ArraySchema();
    this.position = new Point();
  }

  get realPosition() {
    return new Point(
      this.position.x * TILE_SIZE,
      this.position.y * TILE_SIZE
    );
  }
}
