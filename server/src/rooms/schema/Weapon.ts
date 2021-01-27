import { Schema, type } from "@colyseus/schema";

import { Point } from "./Point";
import { WeaponType } from "./WeaponType";

import { TILE_SIZE } from "./constants";

export class Weapon extends Schema {
  // The range of the weapon
  @type('uint32')
  range: number;

  // The sprite used by the weapon
  @type('string')
  sprite: string;

  // The type of the weapon
  @type('string')
  type: WeaponType;

  // The position of the weapon on the map
  @type(Point)
  position: Point;

  // If the weapon is trapped on the floor or not
  @type("boolean")
  trapped: boolean;

  // If the weapon is broken because it was used or not
  @type("boolean")
  broken: boolean;

  constructor() {
    super();
    this.type = 'slash';
    this.range = TILE_SIZE;
    this.sprite = 'knife';
    this.position = new Point();
    this.trapped = true;
    this.broken = false;
  }
}
