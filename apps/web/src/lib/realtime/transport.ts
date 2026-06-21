// ─── P5 클라이언트 Transport 추상화 ──────────────────────────────
// WebSocket 송수신을 인터페이스로 격리한다. 실제 WebSocket은 어댑터로 분리하여
// 테스트에서 FakeTransport를 주입할 수 있게 한다(상위 relayClient/hook 격리 경계).

export interface Transport {
  send(data: string): void;
  /** 메시지 수신 콜백 등록. 반환값은 구독 해제 함수. */
  onMessage(cb: (data: string) => void): () => void;
  onOpen(cb: () => void): () => void;
  onClose(cb: () => void): () => void;
  close(): void;
}

/**
 * 브라우저 native WebSocket 어댑터. open 전 send는 버퍼링 후 open 시 flush.
 * 알려진 한계: open 이전에 close되면 pending 버퍼의 미전송 메시지는 유실된다
 * (재연결 중 유실과 별개 시나리오). missing-op 복원은 walking skeleton 범위 밖(P8).
 */
export function createWebSocketTransport(url: string): Transport {
  const ws = new WebSocket(url);
  const pending: string[] = [];

  ws.addEventListener('open', () => {
    for (const data of pending.splice(0)) ws.send(data);
  });

  return {
    send(data) {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
      else pending.push(data);
    },
    onMessage(cb) {
      const handler = (e: MessageEvent) => cb(typeof e.data === 'string' ? e.data : String(e.data));
      ws.addEventListener('message', handler);
      return () => ws.removeEventListener('message', handler);
    },
    onOpen(cb) {
      ws.addEventListener('open', cb);
      return () => ws.removeEventListener('open', cb);
    },
    onClose(cb) {
      ws.addEventListener('close', cb);
      return () => ws.removeEventListener('close', cb);
    },
    close() {
      ws.close();
    },
  };
}

/**
 * 끊김 시 재연결하는 Transport (FR-7, walking skeleton 수준 단순 retry).
 * 등록된 콜백은 재연결을 넘어 유지된다. transportFactory를 주입하면 FakeTransport로 단위 테스트 가능.
 *
 * 알려진 한계(walking skeleton, P8에서 해소):
 * - 재연결 대기 중 send된 op는 새 inner로 승계되지 않아 유실된다(missing-op 복원은 P8 범위).
 * - 재접속 후에는 join만 재전송하며 끊긴 동안의 원격 op는 받지 못한다(snapshot/sync는 P8).
 */
export function createRetryingTransport(
  url: string,
  opts?: { delayMs?: number; transportFactory?: (url: string) => Transport },
): Transport {
  const factory = opts?.transportFactory ?? createWebSocketTransport;
  const delayMs = opts?.delayMs ?? 1000;
  const messageCbs = new Set<(data: string) => void>();
  const openCbs = new Set<() => void>();
  const closeCbs = new Set<() => void>();

  let inner: Transport;
  let innerUnsubs: Array<() => void> = [];
  let disposed = false;

  function attach(): void {
    if (disposed) return; // dispose 후 스케줄된 재연결이 fire되어도 새 연결을 만들지 않는다.
    inner = factory(url);
    innerUnsubs = [
      inner.onMessage((data) => {
        for (const cb of messageCbs) cb(data);
      }),
      inner.onOpen(() => {
        for (const cb of openCbs) cb();
      }),
      inner.onClose(() => {
        for (const cb of closeCbs) cb();
        if (!disposed) setTimeout(attach, delayMs);
      }),
    ];
  }
  attach();

  return {
    send(data) {
      inner.send(data);
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
      disposed = true;
      for (const unsub of innerUnsubs) unsub();
      inner.close();
    },
  };
}
