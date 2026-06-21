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
          deliver(
            msg.type === 'join'
              ? reg.join(handle, msg.pageId, msg.presence) // P6: presence(displayName) 전달
              : msg.type === 'cursor'
                ? reg.handleCursor(handle, msg) // P6 커서: broadcast
                : reg.handleOp(handle, msg, 'persisted'), // 인메모리 relay는 비영속 — 항상 broadcast
          );
        },
        onMessage(cb) {
          cbs.add(cb);
          return () => cbs.delete(cb);
        },
        // FakeTransport는 onOpen을 fire하지 않는다. 따라서 relayClient의 onOpen→join 자동
        // 경로는 여기서 동작하지 않으며, convergence.test.ts는 join을 수동 호출한다.
        // onOpen→join 자동 경로 자체는 relayClient.test.ts(createFakeTransport.emitOpen)가 커버한다.
        onOpen() {
          return () => {};
        },
        onClose() {
          return () => {};
        },
        close() {
          // P6: leave가 남은 peer에게 보낼 presence-leave Dispatch[]를 deliver한다.
          // inboxes.delete(자기 자신) 이전에 호출 — leave는 남은 peer만 대상이라 순서 안전(M1).
          deliver(reg.leave(handle));
          inboxes.delete(clientId);
        },
      };
    },
  };
}
