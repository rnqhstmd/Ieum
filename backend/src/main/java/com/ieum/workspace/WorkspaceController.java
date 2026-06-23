package com.ieum.workspace;

import com.ieum.common.security.CurrentUserService;
import com.ieum.workspace.dto.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * 워크스페이스 REST 컨트롤러
 * 기본 경로: /api/workspaces
 */
@RestController
@RequestMapping("/api/workspaces")
@RequiredArgsConstructor
public class WorkspaceController {

    private final WorkspaceService workspaceService;
    private final CurrentUserService currentUserService;

    // ───────────────────────────────────────────────
    // 워크스페이스 CRUD
    // ───────────────────────────────────────────────

    /**
     * GET /api/workspaces
     * 내 워크스페이스 목록 조회
     */
    @GetMapping
    public ResponseEntity<List<WorkspaceDto>> listMyWorkspaces() {
        UUID currentUserId = currentUserService.requireCurrentUserId();
        return ResponseEntity.ok(workspaceService.listMyWorkspaces(currentUserId));
    }

    /**
     * POST /api/workspaces
     * 공유 워크스페이스 생성 (요청자가 OWNER)
     */
    @PostMapping
    public ResponseEntity<WorkspaceDto> createWorkspace(@RequestBody CreateWorkspaceRequest request) {
        UUID currentUserId = currentUserService.requireCurrentUserId();
        WorkspaceDto created = workspaceService.createSharedWorkspace(currentUserId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    /**
     * PATCH /api/workspaces/{id}
     * 워크스페이스 이름 변경
     */
    @PatchMapping("/{id}")
    public ResponseEntity<WorkspaceDto> renameWorkspace(
            @PathVariable UUID id,
            @RequestBody RenameWorkspaceRequest request) {
        UUID currentUserId = null; // TODO(Phase 1): 인증 컨텍스트에서 추출
        return ResponseEntity.ok(workspaceService.renameWorkspace(currentUserId, id, request));
    }

    /**
     * DELETE /api/workspaces/{id}
     * 워크스페이스 삭제 — OWNER만, PERSONAL 불가
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteWorkspace(@PathVariable UUID id) {
        UUID currentUserId = null; // TODO(Phase 1): 인증 컨텍스트에서 추출
        workspaceService.deleteWorkspace(currentUserId, id);
        return ResponseEntity.noContent().build();
    }

    // ───────────────────────────────────────────────
    // 멤버 관리
    // ───────────────────────────────────────────────

    /**
     * GET /api/workspaces/{id}/members
     * 워크스페이스 멤버 목록 조회
     */
    @GetMapping("/{id}/members")
    public ResponseEntity<List<MembershipDto>> listMembers(@PathVariable UUID id) {
        UUID currentUserId = currentUserService.requireCurrentUserId();
        return ResponseEntity.ok(workspaceService.listMembers(currentUserId, id));
    }

    /**
     * DELETE /api/workspaces/{id}/members/{userId}
     * 멤버 제거 — OWNER만
     */
    @DeleteMapping("/{id}/members/{userId}")
    public ResponseEntity<Void> removeMember(
            @PathVariable UUID id,
            @PathVariable UUID userId) {
        UUID currentUserId = currentUserService.requireCurrentUserId();
        workspaceService.removeMember(currentUserId, id, userId);
        return ResponseEntity.noContent().build();
    }

    /**
     * PATCH /api/workspaces/{id}/members/{userId}/role
     * 멤버 역할 변경 — OWNER만
     */
    @PatchMapping("/{id}/members/{userId}/role")
    public ResponseEntity<MembershipDto> updateMemberRole(
            @PathVariable UUID id,
            @PathVariable UUID userId,
            @RequestBody UpdateMemberRoleRequest request) {
        UUID currentUserId = currentUserService.requireCurrentUserId();
        return ResponseEntity.ok(workspaceService.updateMemberRole(currentUserId, id, userId, request));
    }
}
