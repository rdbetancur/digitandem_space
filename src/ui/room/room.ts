// Mission room: real-time play between browsers, with guests and no accounts.
// The pilot's browser hosts the room and runs the simulation; guests connect straight to it
// (WebRTC, through the PeerJS library and its public broker) and operate their stations.
// If no room is open, or the connection fails, the game plays exactly as it does solo.

import { useSyncExternalStore } from 'react';
import type { DataConnection, Peer } from 'peerjs';
import { Flight, createFlight } from '../../sim/flight';
import { Design } from '../../sim/vehicle';
import {
  GuestCmd, HostMsg, IdleInfo, MAX_GUESTS, Member, Seat, Station, applyCommand, applySnapshot, buildSnapshot, cleanName,
  cleanText, guestName, makeCode, normalizeCode, parseGuestMsg, parseHostMsg, NOTE_MAX,
} from './protocol';

const PEER_PREFIX = 'ascent-room-v1-';
const NAME_KEY = 'ascenso.room.name';
const SNAP_MS = 125;
const CONNECT_TIMEOUT_MS = 15000;

export interface Note { from: string; text: string; at: number }

export interface RoomState {
  role: 'none' | 'host' | 'guest';
  status: 'idle' | 'connecting' | 'open' | 'error' | 'closed';
  code: string;
  error: string;
  name: string;
  myId: string;
  members: Member[];
  notes: Note[];
  /** Last thing a crew member did, for everyone to see. */
  feed: string;
  feedAt: number;
  /** Private message for this guest (why a command was refused). */
  say: string;
  sayAt: number;
  /** Guest only: true while the pilot is flying. */
  flying: boolean;
  idle: IdleInfo | null;
}

function storedName(): string {
  try { return cleanName(localStorage.getItem(NAME_KEY)) || guestName(); } catch { return guestName(); }
}

let state: RoomState = {
  role: 'none', status: 'idle', code: '', error: '', name: storedName(), myId: '', members: [], notes: [],
  feed: '', feedAt: 0, say: '', sayAt: 0, flying: false, idle: null,
};
const listeners = new Set<() => void>();
function set(patch: Partial<RoomState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
export function useRoom(): RoomState {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state, () => state);
}
export const roomState = () => state;

let peer: Peer | null = null;
let timer = 0;

// ---------- Host side ----------

interface GuestLink { conn: DataConnection; name: string; seat: Station | null; ready: boolean; stamps: number[] }
const guests = new Map<string, GuestLink>();
let lastIdle: IdleInfo | null = null;

export interface FlightBinding {
  flight: () => Flight;
  missionId: string;
  getWarp: () => number;
  setWarp: (w: number) => void;
  paused: () => boolean;
}
let binding: FlightBinding | null = null;
let lastSnapAt = 0;

function sendTo(g: GuestLink, msg: HostMsg) {
  try { if (g.conn.open) g.conn.send(msg); } catch { /* a guest that left */ }
}
function broadcast(msg: HostMsg) {
  guests.forEach((g) => { if (g.ready) sendTo(g, msg); });
}
function roster(): Member[] {
  const list: Member[] = [{ id: 'host', name: state.name, seat: 'pilot' }];
  guests.forEach((g, id) => { if (g.ready) list.push({ id, name: g.name, seat: g.seat }); });
  return list;
}
function publishRoster() {
  const members = roster();
  set({ members });
  guests.forEach((g, id) => { if (g.ready) sendTo(g, { k: 'roster', members, you: id }); });
}
function pushNote(from: string, text: string) {
  set({ notes: [...state.notes, { from, text, at: Date.now() }].slice(-30) });
}
function pushFeed(text: string) {
  set({ feed: text, feedAt: Date.now() });
}

function onGuestData(id: string, raw: unknown) {
  const g = guests.get(id);
  if (!g) return;
  // At most 12 messages per second from one guest; the rest are dropped.
  const now = Date.now();
  g.stamps = g.stamps.filter((t) => now - t < 1000);
  if (g.stamps.length >= 12) return;
  g.stamps.push(now);
  const msg = parseGuestMsg(raw);
  if (!msg) return;
  if (msg.k === 'hello') {
    g.name = msg.name;
    g.ready = true;
    publishRoster();
    if (lastIdle && !binding) sendTo(g, { k: 'idle', info: lastIdle });
    pushFeed(`${g.name} joined the room.`);
    broadcast({ k: 'feed', text: `${g.name} joined the room.` });
    return;
  }
  if (!g.ready) return;
  if (msg.k === 'seat') {
    g.seat = msg.seat;
    publishRoster();
  } else if (msg.k === 'note') {
    pushNote(g.name, msg.text);
    broadcast({ k: 'note', from: g.name, text: msg.text });
  } else if (msg.k === 'cmd') {
    if (!binding) { sendTo(g, { k: 'say', text: 'The pilot is not flying right now.' }); return; }
    let res;
    try {
      res = applyCommand(binding.flight(), msg.c, g.seat, g.name, { get: binding.getWarp, set: binding.setWarp });
    } catch {
      res = { say: 'That could not be done.' };
    }
    if (res.say) sendTo(g, { k: 'say', text: res.say });
    if (res.feed) { pushFeed(res.feed); broadcast({ k: 'feed', text: res.feed }); }
  }
}

async function loadPeer(): Promise<typeof Peer> {
  return (await import('peerjs')).Peer;
}

function explain(err: unknown): string {
  const type = (err as { type?: string })?.type ?? '';
  if (type === 'peer-unavailable') return 'No room with that code is open. Check the code with your pilot.';
  if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') {
    return 'Could not reach the connection service. Check your internet; some school and office networks block this.';
  }
  if (type === 'browser-incompatible') return 'This browser cannot open live rooms. Try a recent Chrome, Edge, Firefox or Safari.';
  return 'The connection failed. You can keep playing solo and try again.';
}

function rememberName(name: string) {
  try { localStorage.setItem(NAME_KEY, name); } catch { /* storage unavailable */ }
}

export async function roomOpen(nameInput: string, attempt = 0): Promise<void> {
  if (state.role !== 'none' && state.status !== 'error' && state.status !== 'closed') return;
  roomLeave();
  const name = cleanName(nameInput) || guestName();
  rememberName(name);
  const code = makeCode();
  set({ role: 'host', status: 'connecting', code, error: '', name, members: [{ id: 'host', name, seat: 'pilot' }], notes: [], feed: '', flying: false });
  try {
    const PeerCtor = await loadPeer();
    const p = new PeerCtor(PEER_PREFIX + code);
    peer = p;
    timer = window.setTimeout(() => {
      if (peer === p && state.status === 'connecting') fail('The connection service did not answer. You can keep playing solo and try again.');
    }, CONNECT_TIMEOUT_MS);
    p.on('open', () => { window.clearTimeout(timer); if (peer === p) set({ status: 'open', myId: 'host' }); });
    p.on('connection', (conn) => {
      const id = conn.peer;
      if (guests.size >= MAX_GUESTS) {
        conn.on('open', () => { try { conn.send({ k: 'full' }); } catch { /* gone */ } window.setTimeout(() => conn.close(), 400); });
        return;
      }
      guests.set(id, { conn, name: 'Guest', seat: null, ready: false, stamps: [] });
      conn.on('data', (d) => onGuestData(id, d));
      const drop = () => {
        const g = guests.get(id);
        if (!g) return;
        guests.delete(id);
        publishRoster();
        if (g.ready) { pushFeed(`${g.name} left the room.`); broadcast({ k: 'feed', text: `${g.name} left the room.` }); }
      };
      conn.on('close', drop);
      conn.on('error', drop);
    });
    p.on('error', (err) => {
      if (peer !== p) return;
      const type = (err as { type?: string }).type;
      // The code was already taken: try another one.
      if (type === 'unavailable-id' && attempt < 3) { p.destroy(); peer = null; set({ role: 'none', status: 'idle' }); void roomOpen(name, attempt + 1); return; }
      // A guest that could not be reached is not a reason to close the room.
      if (state.status === 'open' && type !== 'network' && type !== 'server-error') return;
      if (state.status === 'open') { set({ error: 'The connection service dropped. Guests already connected can stay; new ones may not get in.' }); return; }
      fail(explain(err));
    });
    p.on('disconnected', () => { if (peer === p && !p.destroyed) { try { p.reconnect(); } catch { /* keep going */ } } });
  } catch {
    fail('Live rooms could not be loaded. You can keep playing solo.');
  }
}

function fail(error: string) {
  window.clearTimeout(timer);
  teardown();
  set({ status: 'error', error, flying: false });
}

function teardown() {
  guests.forEach((g) => { try { g.conn.close(); } catch { /* gone */ } });
  guests.clear();
  hostConn = null;
  guestFlight = null;
  if (peer) { try { peer.destroy(); } catch { /* gone */ } }
  peer = null;
}

export function roomLeave() {
  window.clearTimeout(timer);
  teardown();
  set({ role: 'none', status: 'idle', code: '', error: '', members: [], notes: [], feed: '', say: '', flying: false, idle: null, myId: '' });
}

/** Host: the Flight screen registers itself so guests can see and operate the flight. */
export function roomBindFlight(b: FlightBinding): () => void {
  binding = b;
  lastSnapAt = 0;
  return () => {
    if (binding === b) binding = null;
    if (state.role === 'host' && lastIdle) broadcast({ k: 'idle', info: lastIdle });
  };
}

/** Host: called from the flight loop; sends the flight to the guests a few times per second. */
export function roomFlightTick(now: number) {
  if (state.role !== 'host' || !binding || guests.size === 0 || now - lastSnapAt < SNAP_MS) return;
  lastSnapAt = now;
  try {
    const f = binding.flight();
    broadcast({ k: 'snap', missionId: binding.missionId, warp: binding.getWarp(), paused: binding.paused(), design: f.design, f: buildSnapshot(f) });
  } catch { /* never let the room break the flight */ }
}

/** Host: tells guests what the pilot is doing when not flying. */
export function roomPublishIdle(info: IdleInfo) {
  lastIdle = info;
  if (state.role === 'host' && !binding) broadcast({ k: 'idle', info });
}

export function roomHostNote(text: string) {
  const t = cleanText(text, NOTE_MAX);
  if (!t || state.role !== 'host') return;
  pushNote(state.name, t);
  broadcast({ k: 'note', from: state.name, text: t });
}

// ---------- Guest side ----------

let hostConn: DataConnection | null = null;
let guestFlight: { f: Flight; designKey: string; missionId: string; warp: number; paused: boolean; at: number } | null = null;

/** Guest: the latest flight received from the pilot, for the canvas loop. */
export const roomGuestFlight = () => guestFlight;

function onHostData(raw: unknown) {
  const msg = parseHostMsg(raw);
  if (!msg) return;
  switch (msg.k) {
    case 'roster': set({ members: msg.members, myId: msg.you }); break;
    case 'note': pushNote(msg.from, msg.text); break;
    case 'feed': pushFeed(msg.text); break;
    case 'say': set({ say: msg.text, sayAt: Date.now() }); break;
    case 'full': fail('That room is full: a crew has at most four people.'); set({ role: 'guest' }); break;
    case 'idle': guestFlight = null; set({ flying: false, idle: msg.info }); break;
    case 'snap': {
      try {
        const key = JSON.stringify(msg.design);
        if (!guestFlight || guestFlight.designKey !== key) {
          guestFlight = { f: createFlight(msg.design as Design), designKey: key, missionId: msg.missionId, warp: 1, paused: false, at: 0 };
        }
        applySnapshot(guestFlight.f, msg.f);
        guestFlight.missionId = msg.missionId;
        guestFlight.warp = msg.warp;
        guestFlight.paused = msg.paused;
        guestFlight.at = performance.now();
        if (!state.flying) set({ flying: true });
      } catch { /* a bad snapshot is skipped */ }
      break;
    }
  }
}

export async function roomJoin(codeInput: string, nameInput: string): Promise<void> {
  const code = normalizeCode(codeInput);
  if (!code) { set({ status: 'error', error: 'That code does not look right. It has 6 letters and numbers.' }); return; }
  roomLeave();
  const name = cleanName(nameInput) || guestName();
  rememberName(name);
  set({ role: 'guest', status: 'connecting', code, error: '', name, members: [], notes: [], feed: '', flying: false, idle: null });
  try {
    const PeerCtor = await loadPeer();
    const p = new PeerCtor();
    peer = p;
    timer = window.setTimeout(() => {
      if (peer === p && state.status === 'connecting') { fail('Could not connect to the room. Check the code and your internet, then try again.'); set({ role: 'guest' }); }
    }, CONNECT_TIMEOUT_MS);
    p.on('open', () => {
      if (peer !== p) return;
      const conn = p.connect(PEER_PREFIX + code, { reliable: true });
      hostConn = conn;
      conn.on('open', () => {
        window.clearTimeout(timer);
        if (peer !== p) return;
        set({ status: 'open' });
        conn.send({ k: 'hello', name });
      });
      conn.on('data', onHostData);
      const closed = () => {
        if (peer !== p || state.status === 'error') return;
        teardown();
        set({ status: 'closed', error: 'The pilot closed the room or lost the connection.', flying: false });
      };
      conn.on('close', closed);
      conn.on('error', closed);
    });
    p.on('error', (err) => { if (peer === p && state.status !== 'open') { fail(explain(err)); set({ role: 'guest' }); } });
  } catch {
    fail('Live rooms could not be loaded.');
    set({ role: 'guest' });
  }
}

function sendHost(msg: unknown) {
  try { if (hostConn?.open) hostConn.send(msg); } catch { /* connection gone */ }
}
export const roomTakeSeat = (seat: Station | null) => sendHost({ k: 'seat', seat });
export const roomCommand = (c: GuestCmd) => sendHost({ k: 'cmd', c });
export function roomGuestNote(text: string) {
  const t = cleanText(text, NOTE_MAX);
  if (t) sendHost({ k: 'note', text: t });
}

/** Names of whoever sits at a seat, for the panel tags. Empty when no room is open. */
export function seatNames(members: Member[], seat: Seat): string {
  return members.filter((m) => m.seat === seat).map((m) => m.name).join(', ');
}

export const inviteLink = (code: string) => `${window.location.href.split('#')[0]}#room=${code}`;
