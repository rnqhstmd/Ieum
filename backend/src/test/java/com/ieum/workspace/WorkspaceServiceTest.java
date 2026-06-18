package com.ieum.workspace;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.ieum.user.UserRepository;
import com.ieum.workspace.dto.WorkspaceDto;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class WorkspaceServiceTest {

    @Mock
    private WorkspaceRepository workspaceRepository;

    @Mock
    private MembershipRepository membershipRepository;

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private WorkspaceService workspaceService;

    // ── AC-AUTH-02: 개인 워크스페이스 신규 생성 ──────────────────────────

    @Test
    @DisplayName("AC-AUTH-02: PERSONAL 워크스페이스 없을 때 — Workspace·Membership이 저장되고 생성된 Workspace가 반환된다")
    void ensurePersonalWorkspace_whenNotExists_savesWorkspaceAndMembership() {
        // Given
        UUID ownerId = UUID.randomUUID();
        UUID savedWsId = UUID.randomUUID();

        when(workspaceRepository.existsByOwnerIdAndType(ownerId, WorkspaceType.PERSONAL))
                .thenReturn(false);

        when(workspaceRepository.save(any(Workspace.class))).thenAnswer(inv -> {
            Workspace ws = inv.getArgument(0);
            return Workspace.builder()
                    .id(savedWsId)
                    .name(ws.getName())
                    .type(ws.getType())
                    .ownerId(ws.getOwnerId())
                    .build();
        });

        when(membershipRepository.save(any(Membership.class))).thenAnswer(inv -> inv.getArgument(0));

        // When
        Workspace result = workspaceService.ensurePersonalWorkspace(ownerId);

        // Then: Workspace 저장 내용 검증
        ArgumentCaptor<Workspace> wsCaptor = ArgumentCaptor.forClass(Workspace.class);
        verify(workspaceRepository).save(wsCaptor.capture());
        Workspace savedWs = wsCaptor.getValue();

        assertThat(savedWs.getType()).isEqualTo(WorkspaceType.PERSONAL);
        assertThat(savedWs.getOwnerId()).isEqualTo(ownerId);
        assertThat(savedWs.getName()).isEqualTo("내 워크스페이스");

        // Then: Membership 저장 내용 검증
        ArgumentCaptor<Membership> memberCaptor = ArgumentCaptor.forClass(Membership.class);
        verify(membershipRepository).save(memberCaptor.capture());
        Membership savedMembership = memberCaptor.getValue();

        assertThat(savedMembership.getRole()).isEqualTo(MemberRole.OWNER);
        assertThat(savedMembership.getUserId()).isEqualTo(ownerId);
        assertThat(savedMembership.getWorkspaceId()).isEqualTo(savedWsId);

        // Then: 반환값 검증
        assertThat(result.getId()).isEqualTo(savedWsId);
        assertThat(result.getType()).isEqualTo(WorkspaceType.PERSONAL);
        assertThat(result.getOwnerId()).isEqualTo(ownerId);
    }

    // ── BR-2: 멱등 — 이미 존재하는 경우 save 없이 기존 반환 ───────────

    @Test
    @DisplayName("BR-2: PERSONAL 워크스페이스가 이미 존재할 때 — save를 호출하지 않고 기존 Workspace를 반환한다")
    void ensurePersonalWorkspace_whenAlreadyExists_returnsExistingWithoutSave() {
        // Given
        UUID ownerId = UUID.randomUUID();
        Workspace existing = Workspace.builder()
                .id(UUID.randomUUID())
                .name("내 워크스페이스")
                .type(WorkspaceType.PERSONAL)
                .ownerId(ownerId)
                .build();

        when(workspaceRepository.existsByOwnerIdAndType(ownerId, WorkspaceType.PERSONAL))
                .thenReturn(true);
        when(workspaceRepository.findFirstByOwnerIdAndType(ownerId, WorkspaceType.PERSONAL))
                .thenReturn(Optional.of(existing));

        // When
        Workspace result = workspaceService.ensurePersonalWorkspace(ownerId);

        // Then: 새 저장 없음
        verify(workspaceRepository, never()).save(any());
        verify(membershipRepository, never()).save(any());

        // Then: 기존 워크스페이스 반환
        assertThat(result).isSameAs(existing);
    }

    // ── AC-10: 멤버십 기반 워크스페이스 목록 ───────────────────────────
    @Test
    @DisplayName("AC-10: listMyWorkspaces — 사용자 멤버십 기반으로 소속 워크스페이스 목록을 반환한다")
    void listMyWorkspaces_returnsWorkspacesFromMemberships() {
        // Given
        UUID userId = UUID.randomUUID();
        UUID ws1Id = UUID.randomUUID();
        UUID ws2Id = UUID.randomUUID();

        when(membershipRepository.findByUserId(userId)).thenReturn(List.of(
                Membership.builder().userId(userId).workspaceId(ws1Id).role(MemberRole.OWNER).build(),
                Membership.builder().userId(userId).workspaceId(ws2Id).role(MemberRole.MEMBER).build()
        ));
        when(workspaceRepository.findAllById(List.of(ws1Id, ws2Id))).thenReturn(List.of(
                Workspace.builder().id(ws1Id).name("내 워크스페이스").type(WorkspaceType.PERSONAL).ownerId(userId).build(),
                Workspace.builder().id(ws2Id).name("팀").type(WorkspaceType.SHARED).ownerId(UUID.randomUUID()).build()
        ));

        // When
        List<WorkspaceDto> result = workspaceService.listMyWorkspaces(userId);

        // Then
        assertThat(result).hasSize(2);
        assertThat(result).extracting(WorkspaceDto::id).containsExactlyInAnyOrder(ws1Id, ws2Id);
    }

    // ── AC-11: 멤버십 없으면 빈 목록 ───────────────────────────────────
    @Test
    @DisplayName("AC-11: listMyWorkspaces — 멤버십이 0건이면 빈 목록을 반환한다")
    void listMyWorkspaces_noMemberships_returnsEmpty() {
        // Given
        UUID userId = UUID.randomUUID();
        when(membershipRepository.findByUserId(userId)).thenReturn(List.of());

        // When
        List<WorkspaceDto> result = workspaceService.listMyWorkspaces(userId);

        // Then
        assertThat(result).isEmpty();
    }
}
