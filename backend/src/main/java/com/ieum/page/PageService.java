package com.ieum.page;

import com.ieum.common.security.AccessGuard;
import com.ieum.page.dto.*;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
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

        // 빈 제목 허용(노션식): 미입력 시 빈 문자열로 저장 → 프론트가 placeholder("제목 없음") 표시.
        String title = request.title() == null ? "" : request.title();

        if (request.parentPageId() != null) {
            Page parent = pageRepository.findById(request.parentPageId())
                    .orElseThrow(() -> new EntityNotFoundException("부모 페이지를 찾을 수 없습니다."));
            if (!parent.getWorkspaceId().equals(workspaceId)) {
                throw new IllegalArgumentException("부모 페이지가 다른 워크스페이스에 속합니다.");
            }
        }

        // 타임스탬프는 Page의 @PrePersist가 persist 시점(in-memory)에 채운다(응답 DTO non-null 보장).
        Page saved = pageRepository.save(Page.builder()
                .workspaceId(workspaceId)
                .parentPageId(request.parentPageId())
                .title(title)
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
        accessGuard.requireWorkspaceMember(currentUserId, workspaceId);

        Page page = pageRepository.findById(pageId)
                .orElseThrow(() -> new EntityNotFoundException("페이지를 찾을 수 없습니다."));
        if (!page.getWorkspaceId().equals(workspaceId)) {
            throw new IllegalArgumentException("페이지가 다른 워크스페이스에 속합니다.");
        }
        // 아카이브된 페이지는 트리에서 숨겨진 삭제 상태 — 수정 불가(404로 취급)
        if (page.getArchivedAt() != null) {
            throw new EntityNotFoundException("아카이브된 페이지는 수정할 수 없습니다.");
        }

        // 부분 갱신: null 필드는 변경하지 않는다. 빈 제목도 허용(노션식 — 사용자가 제목을 비울 수 있음).
        if (request.title() != null) {
            page.setTitle(request.title());
        }
        if (request.icon() != null) {
            page.setIcon(request.icon());
        }

        return toDto(pageRepository.save(page), null);
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
        accessGuard.requireWorkspaceMember(currentUserId, workspaceId);

        Page target = pageRepository.findById(pageId)
                .orElseThrow(() -> new EntityNotFoundException("페이지를 찾을 수 없습니다."));
        if (!target.getWorkspaceId().equals(workspaceId)) {
            throw new IllegalArgumentException("페이지가 다른 워크스페이스에 속합니다.");
        }
        // 이미 아카이브된 페이지면 불필요한 조회·BFS·저장을 건너뛴다(멱등 no-op).
        if (target.getArchivedAt() != null) {
            return;
        }

        // 활성 페이지로 parentPageId→children 맵 구성 후 대상부터 BFS로 후손 수집(대상 포함).
        // createPage가 부모 사전 존재를 강제하므로 사이클 없음(유한). seen으로 방어.
        List<Page> active = pageRepository.findByWorkspaceIdAndArchivedAtIsNull(workspaceId);
        Map<UUID, List<Page>> byParent = new HashMap<>();
        Map<UUID, Page> byId = new HashMap<>();
        for (Page p : active) {
            byParent.computeIfAbsent(p.getParentPageId(), k -> new ArrayList<>()).add(p);
            byId.put(p.getId(), p);
        }

        Instant now = Instant.now();
        List<Page> toArchive = new ArrayList<>();
        Set<UUID> seen = new HashSet<>();
        Deque<UUID> queue = new ArrayDeque<>();
        queue.add(pageId);
        while (!queue.isEmpty()) {
            UUID id = queue.poll();
            if (!seen.add(id)) continue;
            Page p = byId.get(id);
            if (p == null) continue; // 이미 아카이브됐거나 활성 목록에 없음
            p.setArchivedAt(now);
            toArchive.add(p);
            for (Page child : byParent.getOrDefault(id, List.of())) {
                queue.add(child.getId());
            }
        }

        pageRepository.saveAll(toArchive);
    }

    private static PageDto toDto(Page p, List<PageDto> children) {
        return new PageDto(
                p.getId(), p.getWorkspaceId(), p.getParentPageId(), p.getTitle(),
                p.getIcon(), p.getPosition(), p.getCreatedById(),
                p.getCreatedAt(), p.getUpdatedAt(), children);
    }
}
