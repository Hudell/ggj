import { Schema, type } from "@colyseus/schema";

export class Point extends Schema {
  @type('number')
  x: number;

  @type('number')
  y: number;

  constructor(x = 0, y = 0) {
    super();
    this.x = x || 0;
    this.y = y || 0;
  }

  set(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
}