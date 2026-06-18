package com.ieum.page;

import com.ieum.page.dto.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * 페이지 REST 컨트롤러
 * 기본 경로: /api/workspaces/{wsId}/pages
 */
@RestController
@RequestMapping("/api/workspaces/{wsId}/pages")
@RequiredArgsConstructor
public class PageController {

    private final PageService pageService;

    /**
     * GET /api/workspaces/{wsId}/pages
     * 워크스페이스 페이지 트리 조회 (아카이브 제외)
     */
    @GetMapping
    public ResponseEntity<List<PageDto>> getPageTree(@PathVariable UUID wsId) {
        UUID currentUserId = null; // TODO(Phase 1): 인증 컨텍스트에서 추출
        return ResponseEntity.ok(pageService.getPageTree(currentUserId, wsId));
    }

    /**
     * POST /api/workspaces/{wsId}/pages
     * 페이지 생성 (부모 지정 가능)
     */
    @PostMapping
    public ResponseEntity<PageDto> createPage(
            @PathVariable UUID wsId,
            @RequestBody CreatePageRequest request) {
        UUID currentUserId = null; // TODO(Phase 1): 인증 컨텍스트에서 추출
        PageDto created = pageService.createPage(currentUserId, wsId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    /**
     * PATCH /api/workspaces/{wsId}/pages/{pageId}
     * 페이지 제목/아이콘 변경
     */
    @PatchMapping("/{pageId}")
    public ResponseEntity<PageDto> updatePage(
            @PathVariable UUID wsId,
            @PathVariable UUID pageId,
            @RequestBody UpdatePageRequest request) {
        UUID currentUserId = null; // TODO(Phase 1): 인증 컨텍스트에서 추출
        return ResponseEntity.ok(pageService.updatePage(currentUserId, wsId, pageId, request));
    }

    /**
     * PATCH /api/workspaces/{wsId}/pages/{pageId}/move
     * 페이지 이동 (부모 변경 + 순서 변경)
     */
    @PatchMapping("/{pageId}/move")
    public ResponseEntity<PageDto> movePage(
            @PathVariable UUID wsId,
            @PathVariable UUID pageId,
            @RequestBody MovePageRequest request) {
        UUID currentUserId = null; // TODO(Phase 1): 인증 컨텍스트에서 추출
        return ResponseEntity.ok(pageService.movePage(currentUserId, wsId, pageId, request));
    }

    /**
     * DELETE /api/workspaces/{wsId}/pages/{pageId}
     * 페이지 아카이브 (soft delete)
     */
    @DeleteMapping("/{pageId}")
    public ResponseEntity<Void> archivePage(
            @PathVariable UUID wsId,
            @PathVariable UUID pageId) {
        UUID currentUserId = null; // TODO(Phase 1): 인증 컨텍스트에서 추출
        pageService.archivePage(currentUserId, wsId, pageId);
        return ResponseEntity.noContent().build();
    }
}
