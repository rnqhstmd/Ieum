package com.ieum.invitation;

import com.ieum.common.ConflictException;
import com.ieum.common.email.ResendEmailClient;
import com.ieum.common.security.AccessGuard;
import com.ieum.invitation.dto.*;
import com.ieum.user.UserRepository;
import com.ieum.workspace.MemberRole;
import com.ieum.workspace.Membership;
import com.ieum.workspace.MembershipRepository;
import com.ieum.workspace.Workspace;
import com.ieum.workspace.WorkspaceRepository;
import com.ieum.workspace.WorkspaceService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.List;
import java.util.UUID;

/**
 * 초대 도메인 서비스
 *
 * 도메인 규칙 요약:
 *  - OWNER만 초대 생성·철회 가능
 *  - token은 SecureRandom 기반 랜덤 생성
 *  - 초대 만료: 생성 시점 +7일 (expiresAt)
 *  - 이메일 발송 실패 시 PENDING 상태 유지 (fallback: 로그 경고 후 예외 미전파)
 *  - 초대 수락 시: PENDING + 미만료 검증 → Membership 생성 → 상태 ACCEPTED (단일 트랜잭션)
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class InvitationService {

    private final InvitationRepository invitationRepository;
    private final WorkspaceRepository workspaceRepository;
    private final MembershipRepository membershipRepository;
    private final UserRepository userRepository;
    private final WorkspaceService workspaceService; // 권한 검사 헬퍼 재사용
    private final ResendEmailClient resendEmailClient; // BDATA 팀이 정의, 주입만
    private final AccessGuard accessGuard; // OWNER 권한 검증(슬라이스 ① 정본 헬퍼)

    private static final int TOKEN_BYTE_LENGTH = 32;
    private static final int INVITATION_EXPIRY_DAYS = 7;
    private static final String INVITE_URL_PREFIX = "https://ieum.app/invite?token=";

    // ───────────────────────────────────────────────
    // 초대 생성
    // ───────────────────────────────────────────────

    /**
     * 초대 생성 — OWNER만 호출 가능
     *
     * 흐름:
     *  1. requireOwner(currentUserId, wsId)
     *  2. 이미 PENDING 초대가 있으면 기존 토큰 재발송 or 예외 (Phase 1: 예외)
     *  3. token = generateSecureToken()
     *  4. expiresAt = now + 7일
     *  5. Invitation 저장 (status=PENDING)
     *  6. ResendEmailClient.sendInvitationEmail(email, token) 호출
     *     - 실패 시: log.warn 후 예외 미전파 (PENDING 유지, 사용자는 목록에서 재발송 가능)
     *  7. InvitationDto 반환
     *
     * @param currentUserId // TODO(현재는 @AuthenticationPrincipal 또는 임시)
     */
    @Transactional
    public InvitationDto createInvitation(UUID currentUserId, UUID wsId,
                                          CreateInvitationRequest request) {
        accessGuard.requireOwner(currentUserId, wsId); // 비OWNER → AccessDeniedException(403)

        String email = normalizeEmail(request.email());                 // 빈/공백 → IllegalArgumentException(400)
        MemberRole role = (request.role() != null) ? request.role() : MemberRole.MEMBER;

        // INV-05: 이미 해당 워크스페이스 멤버인 이메일이면 거부(409)
        userRepository.findByEmail(email)
                .flatMap(u -> membershipRepository.findByUserIdAndWorkspaceId(u.getId(), wsId))
                .ifPresent(m -> {
                    throw new ConflictException("이미 워크스페이스 멤버인 사용자입니다.");
                });

        Invitation invitation = invitationRepository.save(Invitation.builder()
                .workspaceId(wsId)
                .email(email)
                .invitedById(currentUserId)
                .role(role)
                .token(generateSecureToken())
                .status(InvitationStatus.PENDING)
                .expiresAt(Instant.now().plus(INVITATION_EXPIRY_DAYS, ChronoUnit.DAYS))
                .build());

        // M5: 초대 메일 발송 — 실패가 초대 생성을 막지 않는다(PENDING 유지).
        try {
            String workspaceName = workspaceRepository.findById(wsId)
                    .map(Workspace::getName).orElse("워크스페이스");
            resendEmailClient.sendInvitationEmail(email,
                    INVITE_URL_PREFIX + invitation.getToken(), workspaceName);
        } catch (Exception e) {
            log.warn("초대 이메일 발송 실패 (email={}): {}", email, e.getMessage());
        }

        return toDto(invitation);
    }

    private static String normalizeEmail(String raw) {
        String email = (raw == null) ? "" : raw.trim();
        if (email.isEmpty()) {
            throw new IllegalArgumentException("초대 이메일은 비어있을 수 없습니다.");
        }
        return email;
    }

    // ───────────────────────────────────────────────
    // 초대 목록 조회
    // ───────────────────────────────────────────────

    /**
     * 워크스페이스 초대 목록 조회 — OWNER만
     */
    public List<InvitationDto> listInvitations(UUID currentUserId, UUID wsId) {
        // TODO(Phase 1):
        //   1. workspaceService.requireOwner(currentUserId, wsId)
        //   2. invitationRepository.findByWorkspaceId(wsId) — 리포지토리 메서드 추가 필요 (BDATA에 전달)
        //   3. List<InvitationDto> 변환 후 반환
        throw new UnsupportedOperationException("TODO(Phase 1): listInvitations");
    }

    // ───────────────────────────────────────────────
    // 초대 철회 (REVOKE)
    // ───────────────────────────────────────────────

    /**
     * 초대 철회 — OWNER만, PENDING 상태만 철회 가능
     */
    @Transactional
    public void revokeInvitation(UUID currentUserId, UUID wsId, UUID invitationId) {
        // TODO(Phase 1):
        //   1. workspaceService.requireOwner(currentUserId, wsId)
        //   2. invitationRepository.findById(invitationId) → 없으면 EntityNotFoundException
        //   3. invitation.getWorkspaceId().equals(wsId) 검증
        //   4. invitation.getStatus() != PENDING이면 IllegalStateException("철회 불가 상태")
        //   5. invitation.setStatus(InvitationStatus.REVOKED) 저장
        throw new UnsupportedOperationException("TODO(Phase 1): revokeInvitation");
    }

    // ───────────────────────────────────────────────
    // 초대 수락 (단일 트랜잭션)
    // ───────────────────────────────────────────────

    /**
     * 초대 수락 — token 기반, 인증 사용자 본인이 수락
     *
     * 핵심 검증 흐름:
     *  1. invitationRepository.findByToken(token) → 없으면 404
     *  2. status == PENDING 검증 → 아니면 409 (이미 처리된 초대)
     *  3. expiresAt.isBefore(now) 검증 → 만료 시 status=EXPIRED 저장 후 410 Gone
     *  4. 이미 해당 워크스페이스 멤버인지 확인 → 이미 멤버면 200 OK (멱등성)
     *  5. Membership(userId=currentUserId, workspaceId, role) 저장
     *  6. invitation.setStatus(ACCEPTED) 저장
     *  7. MembershipDto 반환
     */
    @Transactional
    public void acceptInvitation(UUID currentUserId, AcceptInvitationRequest request) {
        // TODO(Phase 1):
        //   String token = request.token();
        //
        //   Invitation inv = invitationRepository.findByToken(token)
        //       .orElseThrow(() -> new EntityNotFoundException("유효하지 않은 초대 토큰"));
        //
        //   // 상태 검증
        //   if (inv.getStatus() != InvitationStatus.PENDING) {
        //       throw new IllegalStateException("이미 처리된 초대입니다: " + inv.getStatus());
        //   }
        //
        //   // 만료 검증 — 만료 시 EXPIRED로 전환 후 예외
        //   if (Instant.now().isAfter(inv.getExpiresAt())) {
        //       inv.setStatus(InvitationStatus.EXPIRED);
        //       invitationRepository.save(inv);
        //       throw new IllegalStateException("만료된 초대입니다");
        //   }
        //
        //   // 멱등성: 이미 멤버인 경우 수락 처리 없이 반환
        //   membershipRepository.findByUserIdAndWorkspaceId(currentUserId, inv.getWorkspaceId())
        //       .ifPresent(m -> { return; }); // TODO: 정확한 early-return 처리 (Phase 1)
        //
        //   // Membership 생성
        //   Membership membership = Membership.builder()
        //       .userId(currentUserId)
        //       .workspaceId(inv.getWorkspaceId())
        //       .role(inv.getRole())
        //       .build();
        //   membershipRepository.save(membership);
        //
        //   // 상태 ACCEPTED로 변경
        //   inv.setStatus(InvitationStatus.ACCEPTED);
        //   invitationRepository.save(inv);
        throw new UnsupportedOperationException("TODO(Phase 1): acceptInvitation");
    }

    // ───────────────────────────────────────────────
    // 내부 유틸
    // ───────────────────────────────────────────────

    /**
     * 암호학적으로 안전한 랜덤 토큰 생성 (URL-safe Base64)
     */
    private String generateSecureToken() {
        // TODO(Phase 1): 실제 사용
        byte[] bytes = new byte[TOKEN_BYTE_LENGTH];
        new SecureRandom().nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /**
     * Invitation 엔티티 → InvitationDto 변환
     */
    private InvitationDto toDto(Invitation inv) {
        return new InvitationDto(inv.getId(), inv.getWorkspaceId(), inv.getEmail(),
                inv.getInvitedById(), inv.getRole(), inv.getStatus(),
                inv.getExpiresAt(), inv.getCreatedAt());
    }
}
