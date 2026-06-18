package com.ieum.page;

import com.ieum.page.dto.*;
import com.ieum.workspace.WorkspaceService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * 페이지 도메인 서비스
 *
 * 도메인 규칙 요약:
 *  - 워크스페이스 MEMBER 이상이면 페이지 생성·편집·이동 가능
 *  - 아카이브는 soft delete (archivedAt 설정), 복구 API는 Phase 2
 *  - 트리 구조: parentPageId 자기참조, position으로 순서 관리
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PageService {

    private final PageRepository pageRepository;
    private final WorkspaceService workspaceService; // 권한 검사 헬퍼 재사용

    // ───────────────────────────────────────────────
    // 페이지 CRUD
    // ───────────────────────────────────────────────

    /**
     * 워크스페이스 페이지 트리 조회 (아카이브 제외)
     *
     * @param currentUserId // TODO(현재는 @AuthenticationPrincipal 또는 임시)
     */
    public List<PageDto> getPageTree(UUID currentUserId, UUID workspaceId) {
        // TODO(Phase 1):
        //   1. workspaceService.requireWorkspaceMember(currentUserId, workspaceId)
        //   2. pageRepository.findByWorkspaceIdAndArchivedAtIsNull(workspaceId)
        //   3. 플랫 리스트 → 트리 구조 변환 (parentPageId 기준, position 정렬)
        //   4. List<PageDto> 반환 (최상위 페이지만, children 재귀 설정)
        throw new UnsupportedOperationException("TODO(Phase 1): getPageTree");
    }

    /**
     * 페이지 생성 (부모 지정 가능)
     */
    @Transactional
    public PageDto createPage(UUID currentUserId, UUID workspaceId, CreatePageRequest request) {
        // TODO(Phase 1):
        //   1. workspaceService.requireWorkspaceMember(currentUserId, workspaceId)
        //   2. request.parentPageId() != null이면 부모 페이지가 동일 workspaceId인지 검증
        //   3. Page 저장 (createdById=currentUserId)
        //   4. PageDto 반환 (children=null)
        throw new UnsupportedOperationException("TODO(Phase 1): createPage");
    }

    /**
     * 페이지 제목/아이콘 변경
     */
    @Transactional
    public PageDto updatePage(UUID currentUserId, UUID workspaceId, UUID pageId, UpdatePageRequest request) {
        // TODO(Phase 1):
        //   1. workspaceService.requireWorkspaceMember(currentUserId, workspaceId)
        //   2. pageRepository.findById(pageId) → 없으면 EntityNotFoundException
        //   3. 페이지의 workspaceId가 일치하는지 검증
        //   4. title/icon 변경 저장
        //   5. PageDto 반환
        throw new UnsupportedOperationException("TODO(Phase 1): updatePage");
    }

    /**
     * 페이지 이동 (부모 변경 + 순서 변경)
     */
    @Transactional
    public PageDto movePage(UUID currentUserId, UUID workspaceId, UUID pageId, MovePageRequest request) {
        // TODO(Phase 1):
        //   1. workspaceService.requireWorkspaceMember(currentUserId, workspaceId)
        //   2. 순환 참조 방지: request.parentPageId()가 pageId의 자손이 아닌지 검증
        //   3. page.setParentPageId(request.parentPageId())
        //   4. page.setPosition(request.position()) 저장
        //   5. PageDto 반환
        throw new UnsupportedOperationException("TODO(Phase 1): movePage");
    }

    /**
     * 페이지 아카이브 (soft delete)
     */
    @Transactional
    public void archivePage(UUID currentUserId, UUID workspaceId, UUID pageId) {
        // TODO(Phase 1):
        //   1. workspaceService.requireWorkspaceMember(currentUserId, workspaceId)
        //   2. pageRepository.findById(pageId) → 없으면 EntityNotFoundException
        //   3. page.setArchivedAt(Instant.now()) 저장
        //   4. 하위 페이지 재귀 아카이브 여부는 Phase 2 정책 결정 필요 → 주석 남김
        throw new UnsupportedOperationException("TODO(Phase 1): archivePage");
    }
}
