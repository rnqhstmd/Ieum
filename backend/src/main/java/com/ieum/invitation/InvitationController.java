package com.ieum.invitation;

import com.ieum.common.security.CurrentUserService;
import com.ieum.invitation.dto.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * 초대 REST 컨트롤러
 *
 * 워크스페이스 범위 초대: /api/workspaces/{wsId}/invitations
 * 토큰 기반 수락:          POST /api/invitations/accept
 */
@RestController
@RequiredArgsConstructor
public class InvitationController {

    private final InvitationService invitationService;
    private final CurrentUserService currentUserService;

    /**
     * POST /api/workspaces/{wsId}/invitations
     * 초대 생성 — OWNER만
     */
    @PostMapping("/api/workspaces/{wsId}/invitations")
    public ResponseEntity<InvitationDto> createInvitation(
            @PathVariable UUID wsId,
            @RequestBody CreateInvitationRequest request) {
        UUID currentUserId = currentUserService.requireCurrentUserId();
        InvitationDto created = invitationService.createInvitation(currentUserId, wsId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    /**
     * GET /api/workspaces/{wsId}/invitations
     * 초대 목록 조회 — OWNER만
     */
    @GetMapping("/api/workspaces/{wsId}/invitations")
    public ResponseEntity<List<InvitationDto>> listInvitations(@PathVariable UUID wsId) {
        UUID currentUserId = null; // TODO(Phase 1): 인증 컨텍스트에서 추출
        return ResponseEntity.ok(invitationService.listInvitations(currentUserId, wsId));
    }

    /**
     * DELETE /api/workspaces/{wsId}/invitations/{invitationId}
     * 초대 철회 (REVOKE) — OWNER만, PENDING 상태만
     */
    @DeleteMapping("/api/workspaces/{wsId}/invitations/{invitationId}")
    public ResponseEntity<Void> revokeInvitation(
            @PathVariable UUID wsId,
            @PathVariable UUID invitationId) {
        UUID currentUserId = null; // TODO(Phase 1): 인증 컨텍스트에서 추출
        invitationService.revokeInvitation(currentUserId, wsId, invitationId);
        return ResponseEntity.noContent().build();
    }

    /**
     * POST /api/invitations/accept
     * 초대 수락 — token 기반, 트랜잭션 보장
     * 수락 성공 시 204 No Content
     */
    @PostMapping("/api/invitations/accept")
    public ResponseEntity<Void> acceptInvitation(@RequestBody AcceptInvitationRequest request) {
        UUID currentUserId = null; // TODO(Phase 1): 인증 컨텍스트에서 추출 (비로그인 접근 시 인증 유도)
        invitationService.acceptInvitation(currentUserId, request);
        return ResponseEntity.noContent().build();
    }
}
