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
        // TODO(Phase 1): membershipRepository.findByUserId(currentUserId)로 멤버십 조회 후
        //   workspaceRepository.findAllById(...)로 워크스페이스 목록 조회 → WorkspaceDto 변환
        throw new UnsupportedOperationException("TODO(Phase 1): listMyWorkspaces");
    }

    /**
     * 공유 워크스페이스 생성 + OWNER 멤버십 자동 생성
     *
     * @param currentUserId 인증된 사용자 ID (OWNER가 됨)
     */
    @Transactional
    public WorkspaceDto createSharedWorkspace(UUID currentUserId, CreateWorkspaceRequest request) {
        // TODO(Phase 1):
        //   1. Workspace(type=SHARED, ownerId=currentUserId, name=request.name()) 저장
        //   2. Membership(userId=currentUserId, workspaceId=saved.id(), role=OWNER) 저장
        //   3. WorkspaceDto 반환
        throw new UnsupportedOperationException("TODO(Phase 1): createSharedWorkspace");
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

    // ───────────────────────────────────────────────
    // 권한 검사 헬퍼 (패키지 내부 공유, InvitationService에서도 사용)
    // ───────────────────────────────────────────────

    /**
     * 현재 사용자가 해당 워크스페이스의 멤버인지 확인
     * // TODO(requireWorkspaceMember): membershipRepository.findByUserIdAndWorkspaceId 조회 후
     *    없으면 AccessDeniedException 또는 403 응답
     */
    Membership requireWorkspaceMember(UUID userId, UUID workspaceId) {
        // TODO(Phase 1): 구현
        throw new UnsupportedOperationException("TODO(Phase 1): requireWorkspaceMember");
    }

    /**
     * 현재 사용자가 해당 워크스페이스의 OWNER인지 확인
     * // TODO(requireOwner): requireWorkspaceMember 호출 후 role != OWNER이면 AccessDeniedException
     */
    Membership requireOwner(UUID userId, UUID workspaceId) {
        // TODO(Phase 1): 구현
        throw new UnsupportedOperationException("TODO(Phase 1): requireOwner");
    }
}
