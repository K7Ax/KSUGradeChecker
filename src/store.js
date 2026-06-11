import fs from 'node:fs';
import { DATA_DIR, STATE_FILE } from './config.js';

const EMPTY = { seen: {}, games: {} };

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function loadState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return { seen: parsed.seen ?? {}, games: parsed.games ?? {} };
  } catch {
    return structuredClone(EMPTY);
  }
}

let state = loadState();

function persist() {
  ensureDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

export function resultKey(result) {
  return `${result.term}|${result.courseCode}`;
}

export function isSeen(key) {
  return Object.prototype.hasOwnProperty.call(state.seen, key);
}

export function markSeen(key, grade) {
  state.seen[key] = grade;
  persist();
}

export function createGame(game) {
  state.games[game.id] = game;
  persist();
}

export function getGame(id) {
  return state.games[id] ?? null;
}

export function updateGame(id, patch) {
  if (!state.games[id]) return null;
  state.games[id] = { ...state.games[id], ...patch };
  persist();
  return state.games[id];
}

export function endGame(id) {
  delete state.games[id];
  persist();
}

// Deterministic game id without Date.now()/random (keeps things simple & unique enough).
let gameCounter = Object.keys(state.games).length;
export function nextGameId() {
  gameCounter += 1;
  return `g${gameCounter}`;
}
