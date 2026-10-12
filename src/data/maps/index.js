// Every map you can play a match on, in picker order.
import crossroads from './map1.js';
import plaza from './map2.js';
import foundry from './map3.js';

export const MAPS = [crossroads, plaza, foundry];
export const mapById = (id) => MAPS.find((m) => m.id === id) ?? MAPS[0];
export const randomMap = () => MAPS[Math.floor(Math.random() * MAPS.length)];
