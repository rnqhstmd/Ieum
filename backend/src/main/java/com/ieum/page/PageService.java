package com.ieum.page;

import com.ieum.common.security.AccessGuard;
import com.ieum.page.dto.*;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 페이지 도메인 서비스
 *
 * 도메인 규칙 요약:
 *  - 워크스페이스 MEMBER 이상이면 페이지 생성·편집·이동 가능
 *  - 아카이브는 soft delete (archivedAt 설정), 복구 API는 다음 사이클
 *  - 트리 구조: parentPageId 자기참조, position으로 순서 관리
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PageService {

    private final PageRepository pageRepository;
    private final AccessGuard accessGuard; // 권한 검사 헬퍼 재사용

    // ───────────────────────────────────────────────
    // 페이지 CRUD
    // ───────────────────────────────────────────────

    /**
     * 워크스페이스 페이지 트리 조회 (아카이브 제외)
     */
    public List<PageDto> getPageTree(UUID currentUserId, UUID workspaceId) {
        accessGuard.requireWorkspaceMember(currentUserId, workspaceId);
        List<Page> pages = pageRepository.findByWorkspaceIdAndArchivedAtIsNull(workspaceId);

        // parentPageId 기준 그룹핑 (null 키 = 최상위). HashMap은 null 키 허용.
        Map<UUID, List<Page>> byParent = new HashMap<>();
        for (Page p : pages) {
            byParent.computeIfAbsent(p.getParentPageId(), k -> new ArrayList<>()).add(p);
        }
        return buildSubtree(null, byParent);
    }

    /**
     * 부모 id 하위 트리를 position 오름차순으로 조립한다 (순수 in-memory 재귀).
     * createPage가 부모 사전 존재를 강제하므로 데이터는 DAG → 무한재귀 없음.
     */
    private List<PageDto> buildSubtree(UUID parentId, Map<UUID, List<Page>> byParent) {
        return byParent.getOrDefault(parentId, List.of()).stream()
                .sorted(Comparator.comparingInt(Page::getPosition)
                        .thenComparing(Page::getCreatedAt, Comparator.nullsLast(Comparator.naturalOrder()))
                        .thenComparing(Page::getId))
                .map(p -> toDto(p, buildSubtree(p.getId(), byParent)))
                .toList();
    }

    /**
     * 페이지 생성 (부모 지정 가능)
     */
    @Transactional
    public PageDto createPage(UUID currentUserId, UUID workspaceId, CreatePageRequest request) {
        accessGuard.requireWorkspaceMember(currentUserId, workspaceId);

        if (request.title() == null || request.title().isBlank()) {
            throw new IllegalArgumentException("페이지 제목은 비어 있을 수 없습니다.");
        }

        if (request.parentPageId() != null) {
            Page parent = pageRepository.findById(request.parentPageId())
                    .orElseThrow(() -> new EntityNotFoundException("부모 페이지를 찾을 수 없습니다."));
            if (!parent.getWorkspaceId().equals(workspaceId)) {
                throw new IllegalArgumentException("부모 페이지가 다른 워크스페이스에 속합니다.");
            }
        }

        Page saved = pageRepository.save(Page.builder()
                .workspaceId(workspaceId)
                .parentPageId(request.parentPageId())
                .title(request.title())
                .icon(request.icon())
                .position(request.position())
                .createdById(currentUserId)
                .build());
        return toDto(saved, null);
    }

    /**
     * 페이지 제목/아이콘 변경
     */
    @Transactional
    public PageDto updatePage(UUID currentUserId, UUID workspaceId, UUID pageId, UpdatePageRequest request) {
        // TODO(다음 사이클): updatePage
        throw new UnsupportedOperationException("TODO: updatePage");
    }

    /**
     * 페이지 이동 (부모 변경 + 순서 변경)
     */
    @Transactional
    public PageDto movePage(UUID currentUserId, UUID workspaceId, UUID pageId, MovePageRequest request) {
        // TODO(다음 사이클): movePage (순환 참조 방지 포함)
        throw new UnsupportedOperationException("TODO: movePage");
    }

    /**
     * 페이지 아카이브 (soft delete)
     */
    @Transactional
    public void archivePage(UUID currentUserId, UUID workspaceId, UUID pageId) {
        // TODO(다음 사이클): archivePage (하위 재귀 아카이브 포함)
        throw new UnsupportedOperationException("TODO: archivePage");
    }

    private static PageDto toDto(Page p, List<PageDto> children) {
        return new PageDto(
                p.getId(), p.getWorkspaceId(), p.getParentPageId(), p.getTitle(),
                p.getIcon(), p.getPosition(), p.getCreatedById(),
                p.getCreatedAt(), p.getUpdatedAt(), children);
    }
}
