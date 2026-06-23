package com.ieum.workspace;

import com.ieum.common.security.AccessGuard;
import com.ieum.user.User;
import com.ieum.user.UserRepository;
import com.ieum.workspace.dto.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import jakarta.persistence.EntityNotFoundException;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 워크스페이스 도메인 서비스
 *
 * 도메인 규칙 요약:
 *  - PERSONAL 워크스페이스는 생성·삭제 불가 (이름 변경만 허용)
 *  - SHARED 워크스페이스 생성 시 요청자가 OWNER Membership 자동 생성
 *  - 삭제·멤버 제거·역할 변경은 OWNER만 수행 가능
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class WorkspaceService {

    private final WorkspaceRepository workspaceRepository;
    private final MembershipRepository membershipRepository;
    private final UserRepository userRepository;
    private final AccessGuard accessGuard;
    private final WsRelayAdminClient wsRelayAdminClient;

    private static final int NAME_MAX = 100; // 워크스페이스 이름 최대 길이 (US-WS-02)

    // ───────────────────────────────────────────────
    // 개인 워크스페이스 보장
    // ───────────────────────────────────────────────

    @Transactional
    public Workspace ensurePersonalWorkspace(UUID userId) {
        if (workspaceRepository.existsByOwnerIdAndType(userId, WorkspaceType.PERSONAL)) {
            return workspaceRepository.findFirstByOwnerIdAndType(userId, WorkspaceType.PERSONAL).orElseThrow();
        }
        Workspace ws = workspaceRepository.save(Workspace.builder()
                .type(WorkspaceType.PERSONAL).ownerId(userId).name("내 워크스페이스").build());
        membershipRepository.save(Membership.builder()
                .userId(userId).workspaceId(ws.getId()).role(MemberRole.OWNER).build());
        return ws;
    }

    // ───────────────────────────────────────────────
    // 워크스페이스 CRUD
    // ───────────────────────────────────────────────

    /**
     * 현재 사용자가 속한 워크스페이스 목록 반환
     *
     * @param currentUserId 인증된 사용자 ID
     *                      // TODO(현재는 @AuthenticationPrincipal 또는 임시 헤더로 주입)
     */
    public List<WorkspaceDto> listMyWorkspaces(UUID currentUserId) {
        List<UUID> workspaceIds = membershipRepository.findByUserId(currentUserId).stream()
                .map(Membership::getWorkspaceId)
                .toList();
        return workspaceRepository.findAllById(workspaceIds).stream()
                .map(this::toDto)
                .toList();
    }

    private WorkspaceDto toDto(Workspace ws) {
        return new WorkspaceDto(ws.getId(), ws.getName(), ws.getType(), ws.getOwnerId(), ws.getCreatedAt());
    }

    /**
     * 공유 워크스페이스 생성 + OWNER 멤버십 자동 생성
     *
     * @param currentUserId 인증된 사용자 ID (OWNER가 됨)
     */
    @Transactional
    public WorkspaceDto createSharedWorkspace(UUID currentUserId, CreateWorkspaceRequest request) {
        // 서비스 경계 방어(cross-review MEDIUM / PR #18): 잘못된 인자를 진입부에서 즉시 거부(→400).
        // 컨트롤러 경로는 non-null을 보장하나, 후속 슬라이스/직접 호출 시의 NPE·DB 제약위반(500)을 차단.
        if (currentUserId == null) {
            throw new IllegalArgumentException("currentUserId는 null일 수 없습니다.");
        }
        if (request == null) {
            throw new IllegalArgumentException("요청 본문은 null일 수 없습니다.");
        }
        String name = normalizeName(request.name());
        Workspace ws = workspaceRepository.save(Workspace.builder()
                .type(WorkspaceType.SHARED).ownerId(currentUserId).name(name).build());
        membershipRepository.save(Membership.builder()
                .userId(currentUserId).workspaceId(ws.getId()).role(MemberRole.OWNER).build());
        return toDto(ws);
    }

    /**
     * 워크스페이스 이름 정규화: 앞뒤 공백 제거 후 1~100자 검증 (US-WS-02).
     * 위반(빈 문자열/공백만/100자 초과) 시 IllegalArgumentException → ApiExceptionHandler가 400 매핑.
     */
    private static String normalizeName(String raw) {
        String name = (raw == null) ? "" : raw.trim();
        if (name.isEmpty() || name.length() > NAME_MAX) {
            throw new IllegalArgumentException("워크스페이스 이름은 1자 이상 " + NAME_MAX + "자 이하여야 합니다.");
        }
        return name;
    }

    /**
     * 워크스페이스 이름 변경 (PERSONAL/SHARED 모두 가능, 멤버 본인 확인)
     */
    @Transactional
    public WorkspaceDto renameWorkspace(UUID currentUserId, UUID workspaceId, RenameWorkspaceRequest request) {
        accessGuard.requireWorkspaceMember(currentUserId, workspaceId);
        // 서비스 경계 방어(createSharedWorkspace 패턴 일관): 직접 호출 시 NPE(500) 대신 400으로 거부.
        if (request == null) {
            throw new IllegalArgumentException("요청 본문은 null일 수 없습니다.");
        }
        String name = normalizeName(request.name());
        Workspace ws = workspaceRepository.findById(workspaceId)
                .orElseThrow(() -> new EntityNotFoundException("워크스페이스를 찾을 수 없습니다."));
        ws.setName(name);
        workspaceRepository.save(ws);
        return toDto(ws);
    }

    /**
     * 워크스페이스 삭제 — OWNER만, PERSONAL 불가
     */
    @Transactional
    public void deleteWorkspace(UUID currentUserId, UUID workspaceId) {
        accessGuard.requireOwner(currentUserId, workspaceId);
        Workspace ws = workspaceRepository.findById(workspaceId)
                .orElseThrow(() -> new EntityNotFoundException("워크스페이스를 찾을 수 없습니다."));
        if (ws.getType() == WorkspaceType.PERSONAL) {
            throw new IllegalArgumentException("개인 워크스페이스는 삭제할 수 없습니다");
        }
        List<Membership> members = membershipRepository.findByWorkspaceId(workspaceId);
        for (Membership m : members) {
            wsRelayAdminClient.disconnectUser(m.getUserId());
        }
        workspaceRepository.deleteById(workspaceId);
    }

    // ───────────────────────────────────────────────
    // 멤버 관리
    // ───────────────────────────────────────────────

    /**
     * 워크스페이스 멤버 목록 조회 (멤버 본인이면 조회 가능)
     */
    public List<MembershipDto> listMembers(UUID currentUserId, UUID workspaceId) {
        accessGuard.requireWorkspaceMember(currentUserId, workspaceId);
        List<Membership> memberships = membershipRepository.findByWorkspaceId(workspaceId);
        List<UUID> userIds = memberships.stream().map(Membership::getUserId).toList();
        Map<UUID, User> userMap = userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, Function.identity()));
        return memberships.stream()
                .map(m -> {
                    User u = userMap.get(m.getUserId());
                    return new MembershipDto(
                            m.getId(),
                            m.getUserId(),
                            u != null ? u.getEmail() : null,
                            u != null ? u.getName() : null,
                            m.getRole(),
                            m.getJoinedAt()
                    );
                })
                .toList();
    }

    /**
     * 멤버 제거 — OWNER만, 자기 자신 제거 불가
     */
    @Transactional
    public void removeMember(UUID currentUserId, UUID workspaceId, UUID targetUserId) {
        accessGuard.requireOwner(currentUserId, workspaceId);

        if (currentUserId.equals(targetUserId)) {
            throw new IllegalArgumentException("자기 자신을 제거할 수 없습니다");
        }

        Membership membership = membershipRepository.findByUserIdAndWorkspaceId(targetUserId, workspaceId)
                .orElseThrow(() -> new EntityNotFoundException("멤버를 찾을 수 없습니다."));

        // BR-2: 마지막 OWNER 제거 차단
        // 방어적 가드: 현 검증순서상 도달 불가(단독 OWNER 제거=자기제거→BR-3 흡수)이나 미래 순서 변경 대비
        if (membership.getRole() == MemberRole.OWNER
                && membershipRepository.countByWorkspaceIdAndRole(workspaceId, MemberRole.OWNER) <= 1) {
            throw new IllegalArgumentException("마지막 OWNER를 제거할 수 없습니다");
        }

        membershipRepository.delete(membership);
        wsRelayAdminClient.disconnectUser(targetUserId);
    }

    /**
     * 워크스페이스 나가기 — 본인이 직접 탈퇴 (BR-7)
     */
    @Transactional
    public void leaveWorkspace(UUID currentUserId, UUID workspaceId) {
        Membership m = membershipRepository.findByUserIdAndWorkspaceId(currentUserId, workspaceId)
                .orElseThrow(() -> new EntityNotFoundException("워크스페이스 멤버가 아닙니다."));
        Workspace ws = workspaceRepository.findById(workspaceId)
                .orElseThrow(() -> new EntityNotFoundException("워크스페이스를 찾을 수 없습니다."));
        if (ws.getType() == WorkspaceType.PERSONAL) {
            throw new IllegalArgumentException("개인 워크스페이스에서는 나갈 수 없습니다");
        }
        if (m.getRole() == MemberRole.OWNER
                && membershipRepository.countByWorkspaceIdAndRole(workspaceId, MemberRole.OWNER) <= 1) {
            throw new IllegalArgumentException("마지막 OWNER는 워크스페이스에서 나갈 수 없습니다");
        }
        membershipRepository.delete(m);
        wsRelayAdminClient.disconnectUser(currentUserId);
    }

    /**
     * 멤버 역할 변경 — OWNER만
     */
    @Transactional
    public MembershipDto updateMemberRole(UUID currentUserId, UUID workspaceId,
                                          UUID targetUserId, UpdateMemberRoleRequest request) {
        accessGuard.requireOwner(currentUserId, workspaceId);

        if (request == null || request.role() == null) {
            throw new IllegalArgumentException("role은 null일 수 없습니다.");
        }

        Membership membership = membershipRepository.findByUserIdAndWorkspaceId(targetUserId, workspaceId)
                .orElseThrow(() -> new EntityNotFoundException("멤버를 찾을 수 없습니다."));

        // BR-1: 대상의 현재 role이 OWNER이고 MEMBER로 강등 시, OWNER가 1명뿐이면 차단
        if (membership.getRole() == MemberRole.OWNER && request.role() == MemberRole.MEMBER) {
            long ownerCount = membershipRepository.countByWorkspaceIdAndRole(workspaceId, MemberRole.OWNER);
            if (ownerCount <= 1) {
                throw new IllegalArgumentException("마지막 OWNER의 역할을 변경할 수 없습니다");
            }
        }

        membership.setRole(request.role());
        membershipRepository.save(membership);

        User u = userRepository.findById(targetUserId).orElse(null);
        return new MembershipDto(
                membership.getId(),
                membership.getUserId(),
                u != null ? u.getEmail() : null,
                u != null ? u.getName() : null,
                membership.getRole(),
                membership.getJoinedAt()
        );
    }

}
