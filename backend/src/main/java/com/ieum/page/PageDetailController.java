package com.ieum.page;

import com.ieum.common.security.AccessGuard;
import com.ieum.common.security.CurrentUserService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * 단일 페이지 조회(pageId-only). 제목 자동저장 배선의 전제 — 웹이 pageId만으로 제목·workspaceId를
 * 얻어 제목 PATCH(`/api/workspaces/{wsId}/pages/{pageId}`)를 구성한다. PageController는 wsId-scoped라
 * 별도 컨트롤러로 둔다. 멤버십은 AccessGuard.requirePageAccess가 강제(비멤버 403), 미인증은 401.
 */
@RestController
public class PageDetailController {

    private final CurrentUserService currentUserService;
    private final AccessGuard accessGuard;
    private final PageRepository pageRepository;

    public PageDetailController(CurrentUserService currentUserService,
                                AccessGuard accessGuard,
                                PageRepository pageRepository) {
        this.currentUserService = currentUserService;
        this.accessGuard = accessGuard;
        this.pageRepository = pageRepository;
    }

    @GetMapping("/api/pages/{pageId}")
    public PageDetailResponse get(@PathVariable UUID pageId) {
        UUID userId = currentUserService.requireCurrentUserId();
        accessGuard.requirePageAccess(userId, pageId); // 비멤버 403·미존재 예외
        Page page = pageRepository.findById(pageId)
                .orElseThrow(() -> new IllegalStateException("page not found: " + pageId));
        return new PageDetailResponse(page.getId(), page.getTitle(), page.getIcon(), page.getWorkspaceId());
    }

    public record PageDetailResponse(UUID id, String title, String icon, UUID workspaceId) {}
}
