package com.ieum.invitation;

import com.ieum.common.ConflictException;
import com.ieum.common.GoneException;
import com.ieum.common.email.ResendEmailClient;
import com.ieum.common.security.AccessGuard;
import com.ieum.invitation.dto.*;
import com.ieum.user.User;
import com.ieum.user.UserRepository;
import com.ieum.workspace.MemberRole;
import com.ieum.workspace.Membership;
import com.ieum.workspace.MembershipRepository;
import com.ieum.workspace.Workspace;
import com.ieum.workspace.WorkspaceRepository;
import com.ieum.workspace.WorkspaceService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import jakarta.persistence.EntityNotFoundException;

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
        // 서비스 경계 방어(cross-review MEDIUM / PR #19): request null → 진입부에서 400으로 거부.
        if (request == null) {
            throw new IllegalArgumentException("초대 요청 정보가 누락되었습니다.");
        }
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
        accessGuard.requireOwner(currentUserId, wsId);
        return invitationRepository.findByWorkspaceIdOrderByCreatedAtDesc(wsId)
                .stream().map(this::toDto).toList();
    }

    // ───────────────────────────────────────────────
    // 초대 철회 (REVOKE)
    // ───────────────────────────────────────────────

    /**
     * 초대 철회 — OWNER만, PENDING 상태만 철회 가능
     */
    @Transactional
    public void revokeInvitation(UUID currentUserId, UUID wsId, UUID invitationId) {
        accessGuard.requireOwner(currentUserId, wsId);
        Invitation inv = invitationRepository.findById(invitationId)
                .orElseThrow(() -> new EntityNotFoundException("초대를 찾을 수 없습니다."));
        if (!inv.getWorkspaceId().equals(wsId)) {
            throw new EntityNotFoundException("초대를 찾을 수 없습니다.");
        }
        if (inv.getStatus() != InvitationStatus.PENDING) {
            throw new ConflictException("철회할 수 없는 초대 상태입니다.");
        }
        inv.setStatus(InvitationStatus.REVOKED);
        invitationRepository.save(inv);
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
    /**
     * 초대 수락 — token 기반, 단일 트랜잭션.
     * noRollbackFor=GoneException: 만료(EXPIRED) 전이를 커밋한 뒤 410을 전파하기 위함.
     */
    @Transactional(noRollbackFor = GoneException.class)
    public void acceptInvitation(UUID currentUserId, AcceptInvitationRequest request) {
        if (request == null || request.token() == null || request.token().isBlank()) {
            throw new IllegalArgumentException("초대 토큰이 누락되었습니다.");
        }

        Invitation inv = invitationRepository.findByToken(request.token())
                .orElseThrow(() -> new EntityNotFoundException("유효하지 않은 초대 토큰"));

        // 만료 우선(PENDING + 만료) → EXPIRED 전이 후 410. (이미 EXPIRED 상태는 아래 상태 검증에서 409)
        if (inv.getStatus() == InvitationStatus.PENDING && inv.getExpiresAt().isBefore(Instant.now())) {
            inv.setStatus(InvitationStatus.EXPIRED);
            invitationRepository.save(inv);
            throw new GoneException("만료된 초대입니다.");
        }

        // 상태 검증: PENDING만 수락 가능. 그 외(ACCEPTED/REVOKED/EXPIRED) → 409.
        // SEC(HIGH): 내부 상태값(enum)을 응답 메시지에 노출하지 않는다(고정 문자열).
        if (inv.getStatus() != InvitationStatus.PENDING) {
            throw new ConflictException("이미 처리된 초대입니다.");
        }

        // 이메일 대조: 초대 대상과 현재 사용자가 일치해야 함(trim + 대소문자 무시). 불일치 → 403.
        User user = userRepository.findById(currentUserId)
                .orElseThrow(() -> new EntityNotFoundException("사용자를 찾을 수 없습니다"));
        if (!user.getEmail().trim().equalsIgnoreCase(inv.getEmail().trim())) {
            throw new AccessDeniedException("초대 대상이 아닙니다.");
        }

        // 멱등: 이미 멤버면 Membership 생성만 건너뛴다. 상태 전이(ACCEPTED)는 항상 수행한다.
        boolean alreadyMember = membershipRepository
                .findByUserIdAndWorkspaceId(currentUserId, inv.getWorkspaceId())
                .isPresent();
        if (!alreadyMember) {
            membershipRepository.save(Membership.builder()
                    .userId(currentUserId)
                    .workspaceId(inv.getWorkspaceId())
                    .role(inv.getRole())   // 초대 역할 승계
                    .build());
        }

        inv.setStatus(InvitationStatus.ACCEPTED);
        invitationRepository.save(inv);
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
