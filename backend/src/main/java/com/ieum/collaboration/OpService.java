package com.ieum.collaboration;

import com.ieum.collaboration.dto.WsMessages.OpMessage;
import org.springframework.stereotype.Service;

import java.util.UUID;

/**
 * CRDT 연산 처리 서비스 스텁.
 *
 * <h2>Phase 2 구현 예정 흐름</h2>
 * <ol>
 *   <li>수신한 {@link OpMessage}를 검증 (siteId / seq 중복/순서 체크)</li>
 *   <li>{@link com.ieum.collaboration.CrdtOpRepository}에 append (serverSeq 부여)</li>
 *   <li>{@link RoomManager#broadcast}로 같은 룸 전체에 op 전파</li>
 *   <li>발신자에게 {@link com.ieum.collaboration.dto.WsMessages.OpAck} 전송</li>
 * </ol>
 *
 * <p>CrdtOpRepository / CrdtOp 엔티티는 BDATA 작업자가 com.ieum.collaboration에 정의한다.
 * 이 클래스는 주입만 받고 정의하지 않는다.
 */
@Service
public class OpService {

    private final CrdtOpRepository crdtOpRepository;
    private final RoomManager roomManager;

    public OpService(CrdtOpRepository crdtOpRepository, RoomManager roomManager) {
        this.crdtOpRepository = crdtOpRepository;
        this.roomManager = roomManager;
    }

    /**
     * 클라이언트로부터 수신한 op 메시지를 처리한다.
     *
     * @param pageId 대상 페이지 ID (UUID 문자열)
     * @param msg    파싱된 OpMessage (wire 봉투)
     * @param rawMsg 원본 JSON 문자열 (브로드캐스트용)
     * @throws UnsupportedOperationException Phase 2 구현 예정
     */
    public void handleOp(UUID pageId, OpMessage msg, String rawMsg) {
        // TODO(Phase 2): 검증 → crdtOpRepository.save(CrdtOp) → roomManager.broadcast(...)
        throw new UnsupportedOperationException("Phase 2 (TDD)");
    }
}
