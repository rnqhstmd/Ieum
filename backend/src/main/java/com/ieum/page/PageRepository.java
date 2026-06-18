package com.ieum.page;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

/**
 * 페이지 리포지토리
 */
public interface PageRepository extends JpaRepository<Page, UUID> {

    /** 아카이브되지 않은 워크스페이스 페이지 목록 */
    List<Page> findByWorkspaceIdAndArchivedAtIsNull(UUID workspaceId);
}
