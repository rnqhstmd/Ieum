package com.ieum.collaboration;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

/**
 * CRDT 연산 리포지토리
 */
public interface CrdtOpRepository extends JpaRepository<CrdtOp, UUID> {

    /** 특정 페이지의 server_seq 이후 연산을 순서대로 조회 */
    List<CrdtOp> findByPageIdAndServerSeqGreaterThanOrderByServerSeqAsc(UUID pageId, Long serverSeq);
}
