/*:
 * @target MZ
 * @plugindesc 
 *
 * <pluginName:GGJ01>
 * @author Hudell
 * @url 
 *
 * @help
 **/
(function () {
'use strict';

class CyclonePatcher {
  static initialize(pluginName) {
    this.pluginName = pluginName;
    this.superClasses = new Map();
  }

  static _descriptorIsProperty(descriptor) {
    return descriptor.get || descriptor.set || !descriptor.value || typeof descriptor.value !== 'function';
  }

  static _getAllClassDescriptors(classObj, usePrototype = false) {
    if (classObj === Object) {
      return {};
    }

    const descriptors = Object.getOwnPropertyDescriptors(usePrototype ? classObj.prototype : classObj);
    let parentDescriptors = {};
    if (classObj.prototype) {
      const parentClass = Object.getPrototypeOf(classObj.prototype).constructor;
      if (parentClass !== Object) {
        parentDescriptors = this._getAllClassDescriptors(parentClass, usePrototype);
      }
    }

    return Object.assign({}, parentDescriptors, descriptors);
  }

  static _assignDescriptor(receiver, giver, descriptor, descriptorName, autoRename = false) {
    if (this._descriptorIsProperty(descriptor)) {
      if (descriptor.get || descriptor.set) {
        Object.defineProperty(receiver, descriptorName, {
          get: descriptor.get,
          set: descriptor.set,
          enumerable: descriptor.enumerable,
          configurable: descriptor.configurable,
        });
      } else {
        Object.defineProperty(receiver, descriptorName, {
          value: descriptor.value,
          enumerable: descriptor.enumerable,
          configurable: descriptor.configurable,
        });
      }
    } else {
      let newName = descriptorName;
      if (autoRename) {
        while (newName in receiver) {
          newName = `_${ newName }`;
        }
      }

      receiver[newName] = giver[descriptorName];
    }
  }

  static _applyPatch(baseClass, patchClass, $super, ignoredNames, usePrototype = false) {
    const baseMethods = this._getAllClassDescriptors(baseClass, usePrototype);

    const baseClassOrPrototype = usePrototype ? baseClass.prototype : baseClass;
    const patchClassOrPrototype = usePrototype ? patchClass.prototype : patchClass;
    const descriptors = Object.getOwnPropertyDescriptors(patchClassOrPrototype);
    let anyOverride = false;

    for (const methodName in descriptors) {
      if (ignoredNames.includes(methodName)) {
        continue;
      }

      if (methodName in baseMethods) {
        anyOverride = true;
        const baseDescriptor = baseMethods[methodName];
        this._assignDescriptor($super, baseClassOrPrototype, baseDescriptor, methodName, true);
      }

      const descriptor = descriptors[methodName];
      this._assignDescriptor(baseClassOrPrototype, patchClassOrPrototype, descriptor, methodName);
    }

    return anyOverride;
  }

  static patchClass(baseClass, patchFn) {
    const $super = this.superClasses?.[baseClass.name] || {};
    const $prototype = {};
    const $dynamicSuper = {};
    const patchClass = patchFn($dynamicSuper, $prototype);

    if (typeof patchClass !== 'function') {
      throw new Error(`Invalid class patch for ${ baseClass.name }`); //`
    }

    const ignoredStaticNames = Object.getOwnPropertyNames(class Test{});
    const ignoredNames = Object.getOwnPropertyNames((class Test{}).prototype);
    const anyStaticOverride = this._applyPatch(baseClass, patchClass, $super, ignoredStaticNames);
    const anyNonStaticOverride = this._applyPatch(baseClass, patchClass, $prototype, ignoredNames, true);

    if (anyStaticOverride) {
      const descriptors = Object.getOwnPropertyDescriptors($super);
      for (const descriptorName in descriptors) {
        this._assignDescriptor($dynamicSuper, $super, descriptors[descriptorName], descriptorName);
      }

      if (anyNonStaticOverride) {
        $dynamicSuper.$prototype = $prototype;
      }
    } else  {
      Object.assign($dynamicSuper, $prototype);
    }

    if (this.superClasses) {
      this.superClasses[baseClass.name] = $dynamicSuper;
    }
  }
}

const trueStrings = Object.freeze(['TRUE', 'ON', '1', 'YES', 'T', 'V' ]);

class CyclonePlugin extends CyclonePatcher {
  static initialize(pluginName) {
    super.initialize(pluginName);
    this.fileName = undefined;
    this.params = {};
    this.structs = new Map();
    this.eventListeners = new Map();

    this.structs.set('Dictionary', {
      name: {
        type: 'string',
        defaultValue: '',
      },
      value: {
        type: 'string',
        defaultValue: '',
      },
    });
  }

  static register(paramMap = {}) {
    const dataMap = this.loadAllParams();
    this.params = this.loadParamMap(paramMap, dataMap);
  }

  static loadAllParams() {
    for (const plugin of globalThis.$plugins) {
      if (!plugin?.status) {
        continue;
      }
      if (!plugin?.description?.includes(`<pluginName:${ this.pluginName }`)) { //`
        continue;
      }

      this.fileName = plugin.name;
      const pluginParams = new Map();

      for (const paramName in plugin.parameters) {
        if (!paramName || paramName.startsWith('-')) {
          continue;
        }

        pluginParams.set(paramName, plugin.parameters[paramName]);
      }

      return pluginParams;
    }
  }

  static loadParamMap(paramMap, dataMap = undefined) {
    const params = {};

    for (const key in paramMap) {
      if (!paramMap.hasOwnProperty(key)) {
        continue;
      }

      try {
        params[key] = this.parseParam(key, paramMap, dataMap);
      } catch(e) {
        console.error(`CycloneEngine crashed while trying to parse a parameter value (${ key }). Please report the following error to Hudell:`); //`
        console.log(e);
      }
    }

    return params;
  }

  static registerEvent(eventName, callback) {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, new Set());
    }

    const listeners = this.eventListeners.get(eventName);
    listeners.add(callback);
  }

  static removeEventListener(eventName, callback) {
    if (!this.eventListeners.has(eventName)) {
      return;
    }

    const listeners = this.eventListeners.get(eventName);
    listeners.delete(callback);
  }

  static shouldReturnCallbackResult(result, { abortOnTrue, abortOnFalse, returnOnValue }) {
    if (result === false && abortOnFalse) {
      return true;
    }

    if (result === true && abortOnTrue) {
      return true;
    }

    if (result !== undefined && returnOnValue) {
      return true;
    }

    return false;
  }

  static runEvent(eventName, { abortOnTrue = false, abortOnFalse = false, returnOnValue = false } = {}, ...args) {
    if (!this.eventListeners.has(eventName)) {
      return;
    }

    const listeners = this.eventListeners.get(eventName);
    for (const callback of listeners) {
      if (typeof callback === 'number') {
        this.runCommonEvent(callback);
        continue;
      }
      if (typeof callback !== 'function') {
        console.error('CycloneEngine: Invalid callback type:');
        console.log(callback);
        continue;
      }

      const result = callback(...args);
      if (this.shouldReturnCallbackResult(result, { abortOnTrue, abortOnFalse, returnOnValue })) {
        return result;
      }
    }
  }

  static runCommonEvent(eventId) {
    const commonEvent = globalThis.$dataCommonEvents[eventId];
    if (!commonEvent) {
      return;
    }

    const interpreter = new Game_Interpreter(1);
    interpreter.setup(commonEvent.list, 0);

    if (!this._interpreters) {
      this._interpreters = new Set();
      // Tap into rpg maker core so we can update our interpreters in sync with the engine
      const oldUpdateMain = SceneManager.updateMain;
      SceneManager.updateMain = () => {
        oldUpdateMain.call(SceneManager);
        this.update();
      };
    }

    this._interpreters.add(interpreter);
  }

  static update() {
    if (!this._interpreters) {
      return;
    }

    for (const interpreter of this._interpreters) {
      interpreter.update();

      if (!interpreter.isRunning()) {
        this._interpreters.delete(interpreter);
      }
    }
  }

  static getPluginFileName() {
    return this.fileName ?? this.pluginName;
  }

  static isTrue(value) {
    if (typeof value !== 'string') {
      return Boolean(value);
    }

    return trueStrings.includes(value.toUpperCase());
  }

  static isFalse(value) {
    return !this.isTrue(value);
  }

  static getIntParam({ value, defaultValue }) {
    try {
      const result = parseInt(value);

      if (isNaN(result)) {
        return defaultValue;
      }

      return result;
    } catch(e) {
      if (value !== '') {
        console.error(`Cyclone Engine plugin ${ this.pluginName }: Param is expected to be an integer number, but the received value was '${ value }'.`); //`
      }
      return defaultValue;
    }
  }

  static getFloatParam({ value, defaultValue }) {
    try {
      const result = parseFloat(value.replace(',', '.'));

      if (isNaN(result)) {
        return defaultValue;
      }

      return result;
    } catch(e) {
      if (value !== '') {
        console.error(`Cyclone Engine plugin ${ this.pluginName }: Param is expected to be a number, but the received value was '${ value }'.`); //`
      }

      return defaultValue;
    }
  }

  static getIntListParam({ value }) {
    return this.parseArray((value ?? '').trim(), item => {
      try {
        return parseInt(item.trim());
      } catch(e) {
        if (item !== '') {
          console.error(`Cyclone Engine plugin ${ this.pluginName }: Param is expected to be a list of integer numbers, but one of the items was '${ item }'.`); //`
        }
        return 0;
      }
    });
  }

  static parseStructArrayParam({ data, type }) {
    const newData = [];
    for (const json of data) {
      const itemData = this.parseStructParam({ value: json, defaultValue: '', type });
      if (itemData) {
        newData.push(itemData);
      }
    }

    return newData;
  }

  static getFloatListParam({ value }) {
    return this.parseArray((value || '').trim(), item => {
      try {
        return parseFloat(item.trim());
      } catch(e) {
        if (item !== '') {
          console.error(`Cyclone Engine plugin ${ this.pluginName }: Param ${ name } is expected to be a list of numbers, but one of the items was '${ item }'.`); //`
        }
        return 0;
      }
    });
  }

  static getParam({ value, defaultValue, type }) {
    if (type.endsWith('[]')) {
      return this.parseArrayParam({ value, type });
    }

    if (type.startsWith('struct<')) {
      return this.parseStructParam({ value, defaultValue, type });
    }

    if (value === undefined) {
      return defaultValue;
    }

    switch(type) {
      case 'int':
        return this.getIntParam({value, defaultValue });
      case 'float':
        return this.getFloatParam({ value, defaultValue });
      case 'boolean':
        return (typeof value === 'boolean') ? value : this.isTrue(String(value).trim());
      default:
        return value;
    }
  }

  static getPluginParam(paramName) {
    return this.params.get(paramName);
  }

  static defaultValueForType(typeName) {
    switch(typeName) {
      case 'int':
        return 0;
      case 'boolean':
        return false;
    }

    return '';
  }

  static parseParam(key, paramMap, dataMap = undefined) {
    let paramData = paramMap[key];
    if (paramData && typeof paramData === 'string') {
      paramData = {
        type: paramData,
        defaultValue: this.defaultValueForType(paramData)
      };
    }

    const { name = key, type = 'string', defaultValue = '' } = paramData;
    let value;
    if (dataMap) {
      value = dataMap.get(name) ?? defaultValue;
    } else {
      const data = this.getPluginParam(name) || {};
      value = data.value ?? defaultValue;
    }
    return this.getParam({
      value,
      defaultValue,
      type
    });
  }

  static parseArrayParam({ value, type }) {
    const data = this.parseArray(value);
    if (!data || !data.length) {
      return data;
    }

    const itemType = type.substr(0, type.length - 2);

    const newData = [];
    for (const value of data) {
      const defaultValue = this.defaultValueForType(itemType);
      newData.push(this.getParam({ value, type: itemType, defaultValue }));
    }

    return newData;
  }

  static getRegexMatch(text, regex, matchIndex) {
    const matches = text.match(regex);
    return matches?.[matchIndex];
  }

  static parseStructParam({ value, defaultValue, type }) {
    let data;
    if (value) {
      try {
        data = JSON.parse(value);
      } catch (e) {
        console.error('Cyclone Engine failed to parse param structure: ', value);
        console.error(e);
      }
    }

    if (!data) {
      data = JSON.parse(defaultValue);
    }

    const structTypeName = this.getRegexMatch(type, /struct<(.*)>/i, 1);
    if (!structTypeName) {
      console.error(`Unknown plugin param type: ${ type }`); //`
      return data;
    }

    const structType = this.structs.get(structTypeName);
    if (!structType) {
      console.error(`Unknown param structure type: ${ structTypeName }`); //`
      return data;
    }

    for (const key in structType) {
      if (!structType.hasOwnProperty(key)) {
        continue;
      }

      let dataType = structType[key];
      if (typeof dataType === 'string') {
        dataType = {
          type: dataType,
          defaultValue: this.defaultValueForType(dataType),
        };
      }

      data[key] = this.getParam({
        value: data[key],
        defaultValue: dataType.defaultValue,
        type: dataType.type,
      });
    }

    return data;
  }

  static parseList(data, mapper) {
    let str = data;
    if (str.startsWith('[')) {
      str = str.substr(1);
    }
    if (str.endsWith(']')) {
      str = str.substr(0, str.length -1);
    }

    const list = str.split(',');

    if (mapper) {
      return list.map(item => mapper(item));
    }

    return list;
  }

  static parseArray(value, mapper) {
    let data;
    try {
      data = JSON.parse(value);
    } catch(e) {
      return [];
    }

    if (!data || !data.length) {
      return [];
    }

    if (mapper) {
      return data.map(item => mapper(item));
    }

    return data;
  }

  static registerCommand(commandName, params, fn) {
    if (typeof params === 'function') {
      return PluginManager.registerCommand(this.getPluginFileName(), commandName, params);
    }

    return PluginManager.registerCommand(this.getPluginFileName(), commandName, (receivedArgs) => {
      const dataMap = new Map();
      for (const key in receivedArgs) {
        if (!receivedArgs.hasOwnProperty(key)) {
          continue;
        }
        dataMap.set(key, receivedArgs[key]);
      }
      const parsedArgs = this.loadParamMap(params, dataMap);
      Object.assign(receivedArgs, parsedArgs);

      return fn(receivedArgs);
    });
  }
}

function throttle(fn, delay) {
  let timeout;
  let latestArgs;
  let needsCalling = false;

  const call = () => {
    timeout = setTimeout(() => {
      if (needsCalling) {
        call();
      } else {
        timeout = false;
      }
      needsCalling = false;
    }, delay);

    fn.call(this, ...latestArgs);
  };

  const debounced = function(...args) {
    latestArgs = args;
    if (timeout) {
      needsCalling = true;
      return;
    }

    call();
  };

  return debounced;
}

let client;
let lastX = false;
let lastY = false;

const sendPosition = throttle((room) => {
  const x = Math.round($gamePlayer._x);
  const y = Math.round($gamePlayer._y);

  if (x !== lastX || y !== lastY) {
    room.send('move', {
      x,
      y,
    });
  }
}, 300);

class GGJ$1 extends CyclonePlugin {
  static register() {
    super.initialize('GGJ');
    super.register({});

    this.playerList = [];
    this.myId = false;
  }

  static get serverUrl() {
    return 'ws://127.0.0.1:25672';
    // return 'ws://161.35.225.85:80';
  }

  static get client() {
    if (client) {
      return client;
    }

    if (!globalThis.Colyseus) {
      throw new Error('The core file of Colyseus.js was not found. It needs to be added to your plugin list along with CycloneColyseus.');
    }

    client = new globalThis.Colyseus.Client(this.serverUrl);
    return client;
  }

  static queryRooms() {
    this.client.getAvailableRooms().then((message) => {
      console.log(message);
    });
  }

  static createGame() {
    this.client.joinOrCreate('battle_room', {
      name: 'Player',
    }).then(room => {
      this.myId = room.sessionId;
      this.roomId = room.id;
      this._room = room;

      room.onStateChange((state) => {
        console.log(room.name, 'has new state:', state);

        if (this.me.leader && state.players.length === 8 && state._phase === 'lobby') {
          setTimeout(() => {
            this._room.send('start', {});
          }, 1000);
          return;
        }

        if (state._phase === 'map') {
          if (SceneManager._scene instanceof Scene_Title) {
            this.startMatch(this._match);
            return;
          }

          this.updateState(state);
        }
      });

      room.onMessage('join', (message) => {
        this.playerJoined(message);
      });

      room.onMessage('leave', (message) => {
        this.playerLeft(message);
      });

      room.onMessage('start', (message) => {
        console.log('The match is starting');
        this._match = message;
      });

      room.onMessage('move', (message) => {
        console.log('someone moved', message);
      });

      room.onError((code, message) => {
        console.log(client.id, 'couldn\'t join', room.name);
      });

      room.onLeave((code) => {
        console.log(client.id, 'left', room.name);
        SceneManager.goto(Scene_Title);
      });
    });
  }

  static startMatch(data) {
    lastX = false;
    lastY = false;
    DataManager.setupNewGame();
    setTimeout(() => {
      SceneManager.goto(Scene_Map);
    }, 300);
  }

  static playerJoined(message) {
    if (message.id === this.myId) {
      console.log("I've joined the room.");
    } else {
      console.log('A new player has joined the room.');
    }

    this.runEvent('playerChange', {}, this._room);
  }

  static playerLeft(message) {
    if (message.id === this.myId) {
      console.log("I've left the room ??");
    } else {
      console.log('Someone left the room.');
    }

    this.runEvent('playerChange', {}, this._room);
  }

  static sendPlayerPosition() {
    if (!this._room) {
      return;
    }

    sendPosition(this._room);
  }

  static get players() {
    return this?._room?.state?.players.$items || new Map();
  }

  static get me() {
    const players = this.players;
    // eslint-disable-next-line no-unused-vars
    for (let [idx, player] of players) {
      if (player.id === this.myId) {
        return player;
      }
    }

    return {};
  }

  static getActorByColor(color) {
    return $dataActors.find(a => a && a.name === color);
  }

  static updateState(state) {
    const players = this.players;
    // eslint-disable-next-line no-unused-vars
    for (let [idx, player] of players) {
      if (!player) {
        continue;
      }

      if (player.id === this.myId) {
        continue;
      }

      $gameMap.updateOtherPlayer(player);
    }
  }
}

globalThis.GGJ = GGJ$1;
GGJ$1.register();

GGJ.patchClass(Game_CharacterBase, $super => class {
  // Set the first frame as the "stopped" one
  straigthen() {
    if (this.hasWalkAnime() || this.hasStepAnime()) {
      this._pattern = 0;
    }

    this._animationCount = 0;
  }

  isOriginalPattern() {
    return this.pattern() === 0;
  }

  resetPattern() {
    this.setPattern(0);
  }

  maxPattern() {
    return 8;
  }

  // This changes the movement animation to sequential
  pattern() {
    return this._pattern;
  }

  // Speed up the movement animation a little bit.
  animationWait() {
    return (9 - this.realMoveSpeed()) * 2.5;
  }
});

GGJ.patchClass(Sprite_Character, $super => class {

  setCharacterBitmap() {
    $super.setCharacterBitmap.call(this);

    this.setPatternCount();
  }

  setPatternCount() {
    const match = this._characterName.match(/.+\[(\d+)\]/i);
    if (!match?.length) {
      this._patternCount = 3;
      return;
    }

    this._patternCount = Number(match[1]) || 3;
  }

  patternWidth() {
    if (this._tileId > 0) {
      return $gameMap.tileWidth();
    }

    if (this._isBigCharacter) {
      return this.bitmap.width / this._patternCount;
    }

    return this.bitmap.width / (this._patternCount * 4);
  }

  characterBlockX() {
    if (this._isBigCharacter) {
      return 0;
    }

    const index = this._character.characterIndex();
    return (index % 4) * this._patternCount;
  }

  // characterPatternY() {
  //   return (this._character.displayDirection() - 2) / 2;
  // }

});

class DirectionHelper {
  static goesLeft(d) {
    return d && d % 3 === 1;
  }

  static goesRight(d) {
    return d && d % 3 === 0;
  }

  static goesUp(d) {
    return d >= 7 && d <= 9;
  }

  static goesDown(d) {
    return d >= 1 && d <= 3;
  }

  static isDiagonal(d) {
    return this.isVertical(d) && this.isHorizontal(d);
  }

  static isVertical(d) {
    return this.goesDown(d) || this.goesUp(d);
  }

  static isHorizontal(d) {
    return this.goesLeft(d) || this.goesRight(d);
  }

  static shareADirection(dir1, dir2) {
    if (this.goesDown(dir1) && this.goesDown(dir2)) {
      return true;
    }

    if (this.goesLeft(dir1) && this.goesLeft(dir2)) {
      return true;
    }

    if (this.goesRight(dir1) && this.goesRight(dir2)) {
      return true;
    }

    if (this.goesUp(dir1) && this.goesUp(dir2)) {
      return true;
    }

    return false;
  }

  static getFirstDirection(diagonalDirection) {
    if (!diagonalDirection) {
      return diagonalDirection;
    }

    if (diagonalDirection > 6) {
      return 8;
    }
    if (diagonalDirection < 4) {
      return 2;
    }
    return diagonalDirection;
  }

  static getAlternativeDirection(direction, diagonalDirection) {
    if (direction === diagonalDirection) {
      return direction;
    }

    switch (diagonalDirection) {
      case 7:
        return direction == 8 ? 4 : 8;
      case 9:
        return direction == 8 ? 6 : 8;
      case 1:
        return direction == 2 ? 4 : 2;
      case 3:
        return direction == 2 ? 6 : 2;
    }

    return direction;
  }
}

GGJ.patchClass(Game_Player, $super => class {
  setDirection(d) {
    if (DirectionHelper.goesLeft(d)) {
      $super.setDirection.call(this, 4);
    } else if (DirectionHelper.goesRight(d)) {
      $super.setDirection.call(this, 6);
    }
  }

  moveDiagonally(horz, vert) {
    $super.moveDiagonally.call(this, horz, vert);
    this.setDirection(horz);
    GGJ.sendPlayerPosition();
  }

  moveStraight(d) {
    $super.moveStraight.call(this, d);

    GGJ.sendPlayerPosition();
  }
});

GGJ.patchClass(Game_Event, $super => class {
  setDirection(d) {
    if (DirectionHelper.goesLeft(d)) {
      $super.setDirection.call(this, 4);
    } else if (DirectionHelper.goesRight(d)) {
      $super.setDirection.call(this, 6);
    }
  }

  moveDiagonally(horz, vert) {
    $super.moveDiagonally.call(this, horz, vert);
    this.setDirection(horz);
  }
});

GGJ.patchClass(Window_TitleCommand, $super => class {
  makeCommandList() {
    this.addCommand('Join Game', 'joinGame');
    this.addCommand('Exit', 'exit');
  }
});

class WindowLobby extends Window_Command {
  constructor(...args) {
    super(...args);
  }

  initialize(rect) {
    super.initialize(rect);
    GGJ.registerEvent('playerChange', (room) => {
      room.onStateChange.once((state) => {
        console.log(state.players.length);
        this.refresh();
      });
    });
  }

  getPlayerName(number) {
    return number;
  }

  getPlayerData(index) {
    return GGJ._room?.state?.players.getByIndex(index);
  }

  makeCommandList() {
    const players = GGJ.players;
    let count = 0;
    // eslint-disable-next-line no-unused-vars
    for (let [index, player] of players) {
      if (!player) {
        continue;
      }

      const { color = 'unknown' } = player;
      const camelColor = color[0].toUpperCase() + color.substr(1);

      count++;
      if (player.id === GGJ.myId) {
        this.addCommand('-> ' + camelColor, `player_${ count }`, true);
      } else {
        this.addCommand(camelColor, `player_${ count }`, false);
      }
    }

    for (let i = count +1; i <= 8; i++) {
      this.addCommand('-', `player_${ i }`);
    }
  }

  itemTextAlign() {
    return 'left';
  }

  isCommandEnabled(index) {
    return false;
  }

  drawItem(index) {
    const rect = this.itemLineRect(index);
    const align = this.itemTextAlign();
    this.resetTextColor();
    const isMe = this._list[index].enabled;
    this.changePaintOpacity(isMe);
    this.drawText(this.commandName(index), rect.x, rect.y, rect.width, align);
  }

  processOk() {

  }
}

GGJ.patchClass(Scene_Title, $super => class {
  commandJoinGame() {
    GGJ.createGame();
    this._commandWindow.hide();

    if (!this._lobbyWindow) {
      this.createLobbyWindow();
    }
  }

  commandExit() {
    const gui = require('nw.gui');
    const win = gui.Window.get();
    win.close();
  }

  createCommandWindow() {
    $super.createCommandWindow.call(this);
    this._commandWindow.setHandler('joinGame', this.commandJoinGame.bind(this));
    this._commandWindow.setHandler('exit', this.commandExit.bind(this));
  }

  commandWindowRect() {
    const offsetX = $dataSystem.titleCommandWindow.offsetX;
    const offsetY = $dataSystem.titleCommandWindow.offsetY;
    const ww = this.mainCommandWidth();
    const wh = this.calcWindowHeight(2, true);
    const wx = (Graphics.boxWidth - ww) / 2 + offsetX;
    const wy = Graphics.boxHeight - wh - 96 + offsetY;
    return new Rectangle(wx, wy, ww, wh);
  }

  createLobbyWindow() {
    const rect = this.lobbyWindowRect();
    this._lobbyWindow = new WindowLobby(rect);
    this.addWindow(this._lobbyWindow);
  }

  lobbyWindowRect() {
    const offsetX = 8;
    const offsetY = 8;
    const ww = 300;
    const wh = Graphics.height - offsetY;
    const wx = (Graphics.width - ww - offsetX);
    const wy = 0;
    return new Rectangle(wx, wy, ww, wh);
  }

  terminate() {
    $super.terminate.call(this);
  }
});

function pluginIsActive(pluginName) {
  for (const plugin of globalThis.$plugins) {
    if (!plugin?.status) {
      continue;
    }
    if (!plugin?.description?.includes(`<pluginName:${ pluginName }`)) { //`
      continue;
    }

    return true;
  }

  return false;
}

GGJ.patchClass(Scene_Boot, $super => class {
  startNormalGame() {
    if (pluginIsActive('CycloneMapEditor')) {
      this.checkPlayerLocation();
      DataManager.setupNewGame();
      SceneManager.goto(Scene_Map);
      return;
    }

    $super.startNormalGame.call(this);
  }
});

GGJ.patchClass(Game_Party, $super => class {
  setupStartingMembers() {
    this._actors = [];

    if (GGJ._room) {
      const myColor = GGJ.me.color;
      const actor = GGJ.getActorByColor(myColor);
      if (actor) {
        this._actors.push(actor.id);
        return;
      }
    }

    return $super.setupStartingMembers.call(this);
  }
});

GGJ.patchClass(Game_Map, $super => class {
  setupEvents(...args) {
    $super.setupEvents.call(this, ...args);

    this._players = [];
    const players = GGJ.players;
    // eslint-disable-next-line no-unused-vars
    for (let [idx, player] of players) {
      if (!player) continue;
      if (player.id === GGJ.myId) continue;

      this.createOtherPlayer(player);
    }
  }

  createOtherPlayer(playerData) {
    const actor = GGJ.getActorByColor(playerData.color);
    if (!actor) {
      return;
    }

    const event = this.createNormalEventAt(actor.characterName, actor.characterIndex, playerData.position.x, playerData.position.y, 6, false, true);
    event.setThrough(true);
    event.setMoveSpeed(3);

    this._players[playerData.id] = event;
  }

  updateOtherPlayer(playerData) {
    const event = this._players[playerData.id];
    if (!event) {
      return this.createOtherPlayer(playerData);
    }

    if (Math.abs(event._x - playerData.position.x) > 2 || Math.abs(event._y - playerData.position.y) > 2) {
      event.setPosition(playerData.position.x, playerData.position.y);
      event.clearDestination();
    } else {
      event.setDestination(playerData.position.x, playerData.position.y);
    }

  }
});
})();
