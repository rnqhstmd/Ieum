// 테스트용 인메모리 relay — 실제 RoomRegistry(순수)를 거쳐 FakeTransport 간 op를
// 라우팅한다. ws·네트워크·async 없이 BR-2(발신자 제외)를 실제로 통과시킨다.
import { RoomRegistry, parseClientMessage } from '@ieum/ws-relay';
import type { ClientHandle, Dispatch } from '@ieum/ws-relay';
import type { Transport } from '../transport';

export interface InMemoryRelay {
  connect(clientId: string): Transport;
}

export function createInMemoryRelay(): InMemoryRelay {
  const reg = new RoomRegistry();
  const inboxes = new Map<string, Set<(data: string) => void>>();

  function deliver(dispatches: Dispatch[]): void {
    for (const d of dispatches) {
      const cbs = inboxes.get(d.target.id);
      if (cbs) for (const cb of cbs) cb(JSON.stringify(d.message));
    }
  }

  return {
    connect(clientId: string): Transport {
      const handle: ClientHandle = { id: clientId };
      const cbs = new Set<(data: string) => void>();
      inboxes.set(clientId, cbs);
      return {
        send(data) {
          const msg = parseClientMessage(data);
          if (!msg) return;
          deliver(msg.type === 'join' ? reg.join(handle, msg.pageId) : reg.handleOp(handle, msg));
        },
        onMessage(cb) {
          cbs.add(cb);
          return () => cbs.delete(cb);
        },
        // 테스트는 명시적으로 join을 호출하므로 onOpen 자동 트리거는 사용하지 않는다.
        onOpen() {
          return () => {};
        },
        onClose() {
          return () => {};
        },
        close() {
          reg.leave(handle);
          inboxes.delete(clientId);
        },
      };
    },
  };
}
