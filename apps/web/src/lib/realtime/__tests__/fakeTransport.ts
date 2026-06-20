// 테스트용 인메모리 Transport — 실제 WebSocket 없이 송수신을 제어한다.
import type { Transport } from '../transport';

export interface FakeTransport extends Transport {
  /** send()로 전송된 raw 문자열 목록(검증용). */
  readonly sent: string[];
  /** 서버→클라 메시지 도착을 시뮬레이션. */
  emitMessage(data: string): void;
  /** 연결 open 이벤트를 시뮬레이션. */
  emitOpen(): void;
  /** 연결 close 이벤트를 시뮬레이션. */
  emitClose(): void;
  closed: boolean;
}

export function createFakeTransport(): FakeTransport {
  const sent: string[] = [];
  const messageCbs = new Set<(data: string) => void>();
  const openCbs = new Set<() => void>();
  const closeCbs = new Set<() => void>();

  return {
    sent,
    closed: false,
    send(data) {
      sent.push(data);
    },
    onMessage(cb) {
      messageCbs.add(cb);
      return () => messageCbs.delete(cb);
    },
    onOpen(cb) {
      openCbs.add(cb);
      return () => openCbs.delete(cb);
    },
    onClose(cb) {
      closeCbs.add(cb);
      return () => closeCbs.delete(cb);
    },
    close() {
      this.closed = true;
      for (const cb of closeCbs) cb();
    },
    emitMessage(data) {
      for (const cb of messageCbs) cb(data);
    },
    emitOpen() {
      for (const cb of openCbs) cb();
    },
    emitClose() {
      for (const cb of closeCbs) cb();
    },
  };
}
