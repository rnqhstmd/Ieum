package com.ieum.workspace;

import com.ieum.user.User;
import com.ieum.user.UserRepository;
import com.ieum.workspace.dto.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

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
        // TODO(Phase 1):
        //   1. requireWorkspaceMember(currentUserId, workspaceId)
        //   2. workspace.setName(request.name()) 저장
        //   3. WorkspaceDto 반환
        throw new UnsupportedOperationException("TODO(Phase 1): renameWorkspace");
    }

    /**
     * 워크스페이스 삭제 — OWNER만, PERSONAL 불가
     */
    @Transactional
    public void deleteWorkspace(UUID currentUserId, UUID workspaceId) {
        // TODO(Phase 1):
        //   1. requireOwner(currentUserId, workspaceId)
        //   2. workspace 타입이 PERSONAL이면 IllegalStateException("개인 워크스페이스는 삭제할 수 없습니다")
        //   3. workspaceRepository.deleteById(workspaceId) (cascade 처리 확인 필요)
        throw new UnsupportedOperationException("TODO(Phase 1): deleteWorkspace");
    }

    // ───────────────────────────────────────────────
    // 멤버 관리
    // ───────────────────────────────────────────────

    /**
     * 워크스페이스 멤버 목록 조회 (멤버 본인이면 조회 가능)
     */
    public List<MembershipDto> listMembers(UUID currentUserId, UUID workspaceId) {
        // TODO(Phase 1):
        //   1. requireWorkspaceMember(currentUserId, workspaceId)
        //   2. membershipRepository.findByWorkspaceId(workspaceId)
        //   3. 각 userId → userRepository.findById 조회 후 MembershipDto 변환
        throw new UnsupportedOperationException("TODO(Phase 1): listMembers");
    }

    /**
     * 멤버 제거 — OWNER만, 자기 자신 제거 불가
     */
    @Transactional
    public void removeMember(UUID currentUserId, UUID workspaceId, UUID targetUserId) {
        // TODO(Phase 1):
        //   1. requireOwner(currentUserId, workspaceId)
        //   2. currentUserId.equals(targetUserId)이면 IllegalArgumentException("자기 자신을 제거할 수 없습니다")
        //   3. membershipRepository.findByUserIdAndWorkspaceId(targetUserId, workspaceId)
        //      → 없으면 EntityNotFoundException
        //   4. membershipRepository.delete(membership)
        throw new UnsupportedOperationException("TODO(Phase 1): removeMember");
    }

    /**
     * 멤버 역할 변경 — OWNER만
     */
    @Transactional
    public MembershipDto updateMemberRole(UUID currentUserId, UUID workspaceId,
                                          UUID targetUserId, UpdateMemberRoleRequest request) {
        // TODO(Phase 1):
        //   1. requireOwner(currentUserId, workspaceId)
        //   2. OWNER가 1명 이하로 줄어드는 경우 검증 (선택적)
        //   3. membership.setRole(request.role()) 저장
        //   4. MembershipDto 반환
        throw new UnsupportedOperationException("TODO(Phase 1): updateMemberRole");
    }

}
