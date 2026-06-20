import { describe, it, expect, vi } from 'vitest';
import { createRetryingTransport } from '../transport';
import { createFakeTransport, type FakeTransport } from './fakeTransport';

// T9 / FR-7: 연결이 끊기면 재연결하고, 등록된 핸들러는 재연결을 넘어 유지된다.
describe('createRetryingTransport', () => {
  function factoryRecorder() {
    const fakes: FakeTransport[] = [];
    const factory = () => {
      const f = createFakeTransport();
      fakes.push(f);
      return f;
    };
    return { fakes, factory };
  }

  it('FR-7: close 이벤트 후 delay 뒤 재연결하고 핸들러가 유지된다', () => {
    vi.useFakeTimers();
    const { fakes, factory } = factoryRecorder();
    const onOpen = vi.fn();
    const t = createRetryingTransport('ws://x', { delayMs: 100, transportFactory: factory });
    t.onOpen(onOpen);
    expect(fakes).toHaveLength(1);

    fakes[0]!.emitOpen();
    expect(onOpen).toHaveBeenCalledTimes(1);

    fakes[0]!.emitClose();
    vi.advanceTimersByTime(100);
    expect(fakes).toHaveLength(2); // 재연결됨

    fakes[1]!.emitOpen();
    expect(onOpen).toHaveBeenCalledTimes(2); // 핸들러 유지
    vi.useRealTimers();
  });

  it('send는 현재 inner transport로 위임된다', () => {
    const { fakes, factory } = factoryRecorder();
    const t = createRetryingTransport('ws://x', { transportFactory: factory });
    t.send('hi');
    expect(fakes[0]!.sent).toContain('hi');
  });

  it('close() 후에는 재연결하지 않는다', () => {
    vi.useFakeTimers();
    const { fakes, factory } = factoryRecorder();
    const t = createRetryingTransport('ws://x', { delayMs: 50, transportFactory: factory });
    t.close();
    fakes[0]!.emitClose();
    vi.advanceTimersByTime(50);
    expect(fakes).toHaveLength(1);
    vi.useRealTimers();
  });

  it('수신 메시지는 재연결 후 새 inner에서도 라우팅된다', () => {
    vi.useFakeTimers();
    const { fakes, factory } = factoryRecorder();
    const onMessage = vi.fn();
    const t = createRetryingTransport('ws://x', { delayMs: 10, transportFactory: factory });
    t.onMessage(onMessage);
    fakes[0]!.emitMessage('m1');
    fakes[0]!.emitClose();
    vi.advanceTimersByTime(10);
    fakes[1]!.emitMessage('m2');
    expect(onMessage).toHaveBeenCalledWith('m1');
    expect(onMessage).toHaveBeenCalledWith('m2');
    vi.useRealTimers();
  });
});
