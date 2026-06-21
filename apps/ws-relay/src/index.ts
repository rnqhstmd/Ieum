// ─── @ieum/ws-relay 공개 API ─────────────────────────────────────
// 순수 계약(protocol)과 라우팅(RoomRegistry)만 re-export한다.
// ws 의존 어댑터(server.ts)는 main.ts에서 직접 import하며 barrel에 포함하지 않는다
// (소비자 — 예: web 수렴 테스트 — 가 ws 런타임 의존을 끌어들이지 않도록).

export { RoomRegistry } from './room.js';
export type { ClientHandle, Dispatch } from './room.js';
// op 영속화 포트 — InMemoryOpStore/포트는 ws·pg 의존이 없어 barrel 안전(PgOpStore는 pgOpStore.js 별도).
export { InMemoryOpStore, isUuid } from './opStore.js';
export type { OpStore, AppendOutcome } from './opStore.js';
// WS-AUTH 멤버십 인가 포트 (PgMembershipStore는 pgMembershipStore.js 별도 — pg 의존).
export { InMemoryMembershipStore } from './membershipStore.js';
export type { MembershipStore } from './membershipStore.js';
export {
  parseClientMessage,
} from './protocol.js';
export type {
  JoinMsg,
  JoinAckMsg,
  OpMsg,
  OpAckMsg,
  PresenceInfo,
  PresenceUpdateMsg,
  PresenceLeaveMsg,
  CursorMsg,
  CursorUpdateMsg,
  ClientToServer,
  ServerToClient,
} from './protocol.js';
