package com.ieum.collaboration;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

/**
 * 스냅샷 리포지토리
 */
public interface SnapshotRepository extends JpaRepository<Snapshot, UUID> {

    /** 특정 페이지의 최신 스냅샷 조회 */
    Optional<Snapshot> findTopByPageIdOrderByVersionDesc(UUID pageId);
}
