package com.ieum.workspace;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ieum.collaboration.CrdtOpRepository;
import com.ieum.collaboration.Snapshot;
import com.ieum.collaboration.SnapshotRepository;
import com.ieum.invitation.Invitation;
import com.ieum.invitation.InvitationRepository;
import com.ieum.invitation.InvitationStatus;
import com.ieum.page.Page;
import com.ieum.page.PageRepository;
import com.ieum.support.AbstractIntegrationTest;
import com.ieum.user.User;
import com.ieum.user.UserRepository;
import com.ieum.workspace.dto.RenameWorkspaceRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.mockito.ArgumentCaptor;

/**
 * PATCH /api/workspaces/{id} — 워크스페이스 이름 변경 통합 테스트
 *
 * AC-13: MEMBER/OWNER가 유효 이름(1~100자) → 200 + DTO.name = 새이름 + DB 반영
 * AC-14: 비멤버가 PATCH → 403
 */
@AutoConfigureMockMvc
class WorkspaceDeleteLeaveIntegrationTest extends AbstractIntegrationTest {

    @Autowired private MockMvc mockMvc;
    // ObjectMapper는 테스트 컨텍스트(AbstractIntegrationTest)에 빈으로 없으므로 직접 생성 (P9 MemberManagementIntegrationTest 동일).
    // gemini/cross-review의 @Autowired 제안은 이 셋업에서 NoSuchBeanDefinitionException 유발 → 미적용.
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private MembershipRepository membershipRepository;
    @Autowired private PageRepository pageRepository;
    @Autowired private CrdtOpRepository crdtOpRepository;
    @Autowired private SnapshotRepository snapshotRepository;
    @Autowired private InvitationRepository invitationRepository;
    @Autowired private org.springframework.jdbc.core.JdbcTemplate jdbcTemplate;

    // WsRelayAdminClient mock — 실 HTTP 차단
    @MockitoBean
    private WsRelayAdminClient wsRelayAdminClient;

    private static final String OWNER_GOOGLE_ID  = "G-RNM-OWNER";
    private static final String MEMBER_GOOGLE_ID = "G-RNM-MEMBER";
    private static final String OTHER_GOOGLE_ID  = "G-RNM-OTHER";

    private UUID workspaceId;
    private UUID ownerId;
    private UUID memberId;

    @BeforeEach
    void setUp() {
        // FK 역순 정리: crdt_op/snapshot → page → invitation → membership → workspace → user
        crdtOpRepository.deleteAll();
        snapshotRepository.deleteAll();
        pageRepository.deleteAll();
        invitationRepository.deleteAll();
        membershipRepository.deleteAll();
        workspaceRepository.deleteAll();
        userRepository.deleteAll();

        // 사용자 3명: OWNER, MEMBER, 비멤버
        User owner = userRepository.save(User.builder()
                .googleId(OWNER_GOOGLE_ID).email("owner@rnm.com").name("OWNER유저").image("img").build());
        User member = userRepository.save(User.builder()
                .googleId(MEMBER_GOOGLE_ID).email("member@rnm.com").name("MEMBER유저").image("img").build());
        userRepository.save(User.builder()
                .googleId(OTHER_GOOGLE_ID).email("other@rnm.com").name("비멤버유저").image("img").build());

        ownerId  = owner.getId();
        memberId = member.getId();

        // SHARED 워크스페이스
        Workspace workspace = workspaceRepository.save(Workspace.builder()
                .name("원본이름").type(WorkspaceType.SHARED).ownerId(ownerId).build());
        workspaceId = workspace.getId();

        // OWNER·MEMBER 멤버십 2건
        membershipRepository.save(Membership.builder()
                .userId(ownerId).workspaceId(workspaceId).role(MemberRole.OWNER).build());
        membershipRepository.save(Membership.builder()
                .userId(memberId).workspaceId(workspaceId).role(MemberRole.MEMBER).build());
    }

    private static RequestPostProcessor asUser(String googleId) {
        return oauth2Login().attributes(a -> a.put("sub", googleId));
    }

    // ── AC-13: MEMBER가 PATCH /api/workspaces/{id} 유효 이름 → 200 + DTO.name = 새이름 ──

    @Test
    @DisplayName("AC-13: MEMBER가 PATCH /api/workspaces/{id} 유효 이름 → 200, 응답 name=새이름")
    void member_renameWorkspace_returns200_withNewName() throws Exception {
        String body = objectMapper.writeValueAsString(new RenameWorkspaceRequest("새이름"));

        mockMvc.perform(patch("/api/workspaces/{id}", workspaceId)
                        .with(asUser(MEMBER_GOOGLE_ID))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("새이름"));

        // DB 반영 확인(설계 Testability "DB 반영")
        assertThat(workspaceRepository.findById(workspaceId).orElseThrow().getName()).isEqualTo("새이름");
    }

    // ── AC-13(OWNER): OWNER가 PATCH → 200 + DTO.name = 새이름 ──

    @Test
    @DisplayName("AC-13(OWNER): OWNER가 PATCH /api/workspaces/{id} 유효 이름 → 200, 응답 name=새이름")
    void owner_renameWorkspace_returns200_withNewName() throws Exception {
        String body = objectMapper.writeValueAsString(new RenameWorkspaceRequest("OWNER변경이름"));

        mockMvc.perform(patch("/api/workspaces/{id}", workspaceId)
                        .with(asUser(OWNER_GOOGLE_ID))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("OWNER변경이름"));
    }

    // ── AC-14: 비멤버가 PATCH → 403 ──

    @Test
    @DisplayName("AC-14: 비멤버가 PATCH /api/workspaces/{id} → 403")
    void nonMember_renameWorkspace_returns403() throws Exception {
        String body = objectMapper.writeValueAsString(new RenameWorkspaceRequest("해킹이름"));

        mockMvc.perform(patch("/api/workspaces/{id}", workspaceId)
                        .with(asUser(OTHER_GOOGLE_ID))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isForbidden());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DELETE /api/workspaces/{id} 테스트 (T2)
    // ─────────────────────────────────────────────────────────────────────────

    // ── AC-1: OWNER DELETE → 204 + workspace 삭제 + membership 삭제 ──

    @Test
    @DisplayName("AC-1: OWNER가 DELETE /api/workspaces/{id} → 204 + workspace/membership DB에서 삭제")
    void owner_deleteWorkspace_returns204_andWorkspaceRemoved() throws Exception {
        mockMvc.perform(delete("/api/workspaces/{id}", workspaceId)
                        .with(asUser(OWNER_GOOGLE_ID)))
                .andExpect(status().isNoContent());

        assertThat(workspaceRepository.findById(workspaceId)).isEmpty();
        assertThat(membershipRepository.findByWorkspaceId(workspaceId)).isEmpty();
    }

    // ── AC-2: PERSONAL 워크스페이스 삭제 시도 → 400 + 워크스페이스 유지 ──

    @Test
    @DisplayName("AC-2: OWNER가 PERSONAL 워크스페이스 DELETE → 400 + 워크스페이스 유지")
    void owner_deletePersonalWorkspace_returns400_andWorkspacePreserved() throws Exception {
        // PERSONAL 워크스페이스 픽스처 생성
        Workspace personalWs = workspaceRepository.save(Workspace.builder()
                .name("개인스페이스").type(WorkspaceType.PERSONAL).ownerId(ownerId).build());
        UUID personalWsId = personalWs.getId();
        membershipRepository.save(Membership.builder()
                .userId(ownerId).workspaceId(personalWsId).role(MemberRole.OWNER).build());

        mockMvc.perform(delete("/api/workspaces/{id}", personalWsId)
                        .with(asUser(OWNER_GOOGLE_ID)))
                .andExpect(status().isBadRequest());

        assertThat(workspaceRepository.findById(personalWsId)).isPresent();
    }

    // ── AC-3: MEMBER가 DELETE → 403 ──

    @Test
    @DisplayName("AC-3: MEMBER가 DELETE /api/workspaces/{id} → 403")
    void member_deleteWorkspace_returns403() throws Exception {
        mockMvc.perform(delete("/api/workspaces/{id}", workspaceId)
                        .with(asUser(MEMBER_GOOGLE_ID)))
                .andExpect(status().isForbidden());
    }

    // ── AC-4: 비멤버가 DELETE → 403 ──

    @Test
    @DisplayName("AC-4: 비멤버가 DELETE /api/workspaces/{id} → 403")
    void nonMember_deleteWorkspace_returns403() throws Exception {
        mockMvc.perform(delete("/api/workspaces/{id}", workspaceId)
                        .with(asUser(OTHER_GOOGLE_ID)))
                .andExpect(status().isForbidden());
    }

    // ── AC-5: 존재하지 않는 workspaceId DELETE → 403 (requireOwner 멤버십 부재) ──

    @Test
    @DisplayName("AC-5: 존재하지 않는 workspaceId DELETE → 403 (존재 비누설)")
    void randomUuid_deleteWorkspace_returns403() throws Exception {
        UUID nonExistentId = UUID.randomUUID();

        mockMvc.perform(delete("/api/workspaces/{id}", nonExistentId)
                        .with(asUser(OWNER_GOOGLE_ID)))
                .andExpect(status().isForbidden());
    }

    // ── AC-12(DELETE) 회귀가드: 미인증 DELETE → 401 (현재도 Spring Security 선차단으로 통과) ──

    @Test
    @DisplayName("AC-12(DELETE) 회귀가드: 미인증 DELETE /api/workspaces/{id} → 401 [현재 통과, 배선 회귀 방지]")
    void unauthenticated_deleteWorkspace_returns401() throws Exception {
        mockMvc.perform(delete("/api/workspaces/{id}", workspaceId))
                .andExpect(status().isUnauthorized());
    }

    // ── AC-12(PATCH) 회귀가드: 미인증 PATCH → 401 (FR-6 배선 currentUserId=null→requireCurrentUserId 회귀 방지) ──

    @Test
    @DisplayName("AC-12(PATCH) 회귀가드: 미인증 PATCH /api/workspaces/{id} → 401 [현재 통과, 배선 회귀 방지]")
    void unauthenticated_renameWorkspace_returns401() throws Exception {
        String body = objectMapper.writeValueAsString(new RenameWorkspaceRequest("미인증이름"));

        mockMvc.perform(patch("/api/workspaces/{id}", workspaceId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isUnauthorized());
    }

    // ── AC-15: OWNER DELETE 후 wsRelayAdminClient.disconnectUser가 멤버 수만큼 호출됨 ──

    @Test
    @DisplayName("AC-15: OWNER DELETE → disconnectUser가 삭제 전 전체 멤버(owner·member) userId로 각 1회 호출")
    void owner_deleteWorkspace_disconnectsAllMembers() throws Exception {
        // setUp에서 OWNER+MEMBER 멤버십 2건 생성됨
        mockMvc.perform(delete("/api/workspaces/{id}", workspaceId)
                        .with(asUser(OWNER_GOOGLE_ID)))
                .andExpect(status().isNoContent());

        // 단순 times(2)보다 강한 단언: 호출 인자 집합이 삭제 전 멤버 userId 집합과 일치(보강권고 3)
        ArgumentCaptor<UUID> captor = ArgumentCaptor.forClass(UUID.class);
        verify(wsRelayAdminClient, times(2)).disconnectUser(captor.capture());
        assertThat(captor.getAllValues()).containsExactlyInAnyOrder(ownerId, memberId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // T3: DELETE /api/workspaces/{id}/members/me — 나가기(leaveWorkspace) 통합 테스트
    // AC-6, AC-7, AC-8, AC-9, AC-10, AC-11, AC-16 + 라우팅 검증
    // ─────────────────────────────────────────────────────────────────────────

    // ── AC-6: MEMBER /members/me → 204 + 본인 멤버십 삭제 + 워크스페이스 유지 ──

    @Test
    @DisplayName("AC-6: MEMBER가 DELETE /members/me → 204 + 본인 멤버십 DB 삭제 + 워크스페이스 유지")
    void member_leaveWorkspace_returns204_andMembershipRemoved_andWorkspacePreserved() throws Exception {
        mockMvc.perform(delete("/api/workspaces/{id}/members/me", workspaceId)
                        .with(asUser(MEMBER_GOOGLE_ID)))
                .andExpect(status().isNoContent());

        // 본인 멤버십 삭제
        assertThat(membershipRepository.findByUserIdAndWorkspaceId(memberId, workspaceId)).isEmpty();
        // 워크스페이스는 유지
        assertThat(workspaceRepository.findById(workspaceId)).isPresent();
        // OWNER 멤버십은 유지
        assertThat(membershipRepository.findByUserIdAndWorkspaceId(ownerId, workspaceId)).isPresent();
    }

    // ── AC-7: OWNER 2명 중 1명 /members/me → 204 + A 멤버십 삭제 + B(OWNER) 유지 ──

    @Test
    @DisplayName("AC-7: OWNER(2명 중 1명)가 DELETE /members/me → 204 + 본인 멤버십 삭제 + 다른 OWNER 유지")
    void owner_leaveWorkspace_withAnotherOwner_returns204_andOwnMembershipRemoved() throws Exception {
        // OWNER B 추가 픽스처
        User ownerB = userRepository.save(User.builder()
                .googleId("G-LEAVE-OWNER-B").email("ownerb@rnm.com").name("OWNER-B유저").image("img").build());
        UUID ownerBId = ownerB.getId();
        membershipRepository.save(Membership.builder()
                .userId(ownerBId).workspaceId(workspaceId).role(MemberRole.OWNER).build());

        mockMvc.perform(delete("/api/workspaces/{id}/members/me", workspaceId)
                        .with(asUser(OWNER_GOOGLE_ID)))
                .andExpect(status().isNoContent());

        // OWNER A 멤버십 삭제
        assertThat(membershipRepository.findByUserIdAndWorkspaceId(ownerId, workspaceId)).isEmpty();
        // OWNER B 멤버십 유지
        assertThat(membershipRepository.findByUserIdAndWorkspaceId(ownerBId, workspaceId)).isPresent();
        // 워크스페이스 유지
        assertThat(workspaceRepository.findById(workspaceId)).isPresent();
    }

    // ── AC-8: 마지막 OWNER /members/me → 400 + 메시지 + 멤버십 유지 ──

    @Test
    @DisplayName("AC-8: 마지막 OWNER가 DELETE /members/me → 400 + '마지막 OWNER' 메시지 + 멤버십 유지")
    void lastOwner_leaveWorkspace_returns400_andMembershipPreserved() throws Exception {
        // setUp에서 OWNER 1명(SHARED 워크스페이스) — 그대로 사용
        mockMvc.perform(delete("/api/workspaces/{id}/members/me", workspaceId)
                        .with(asUser(OWNER_GOOGLE_ID)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("마지막 OWNER는 워크스페이스에서 나갈 수 없습니다"));

        // 멤버십 유지
        assertThat(membershipRepository.findByUserIdAndWorkspaceId(ownerId, workspaceId)).isPresent();
    }

    // ── AC-9: PERSONAL 워크스페이스 /members/me → 400 + 멤버십 유지 ──

    @Test
    @DisplayName("AC-9: PERSONAL 워크스페이스에서 DELETE /members/me → 400 + 멤버십 유지")
    void owner_leavePersonalWorkspace_returns400() throws Exception {
        // PERSONAL 워크스페이스 픽스처 생성
        Workspace personalWs = workspaceRepository.save(Workspace.builder()
                .name("개인스페이스").type(WorkspaceType.PERSONAL).ownerId(ownerId).build());
        UUID personalWsId = personalWs.getId();
        membershipRepository.save(Membership.builder()
                .userId(ownerId).workspaceId(personalWsId).role(MemberRole.OWNER).build());

        mockMvc.perform(delete("/api/workspaces/{id}/members/me", personalWsId)
                        .with(asUser(OWNER_GOOGLE_ID)))
                .andExpect(status().isBadRequest());

        // 멤버십 유지
        assertThat(membershipRepository.findByUserIdAndWorkspaceId(ownerId, personalWsId)).isPresent();
    }

    // ── AC-10: 비멤버가 SHARED /members/me → 404 ──

    @Test
    @DisplayName("AC-10: 비멤버가 DELETE /members/me → 404")
    void nonMember_leaveWorkspace_returns404() throws Exception {
        mockMvc.perform(delete("/api/workspaces/{id}/members/me", workspaceId)
                        .with(asUser(OTHER_GOOGLE_ID)))
                .andExpect(status().isNotFound());
    }

    // ── AC-11: 존재하지 않는 workspaceId /members/me → 404 ──

    @Test
    @DisplayName("AC-11: 존재하지 않는 workspaceId DELETE /members/me → 404")
    void randomUuid_leaveWorkspace_returns404() throws Exception {
        UUID nonExistentId = UUID.randomUUID();

        mockMvc.perform(delete("/api/workspaces/{id}/members/me", nonExistentId)
                        .with(asUser(MEMBER_GOOGLE_ID)))
                .andExpect(status().isNotFound());
    }

    // ── AC-16: MEMBER 나가기 성공 후 wsRelayAdminClient.disconnectUser(memberId) 1회 호출 ──

    @Test
    @DisplayName("AC-16: MEMBER 나가기 성공 → wsRelayAdminClient.disconnectUser(memberId) 정확히 1회")
    void member_leaveWorkspace_disconnectsOnce() throws Exception {
        mockMvc.perform(delete("/api/workspaces/{id}/members/me", workspaceId)
                        .with(asUser(MEMBER_GOOGLE_ID)))
                .andExpect(status().isNoContent());

        ArgumentCaptor<UUID> captor = ArgumentCaptor.forClass(UUID.class);
        verify(wsRelayAdminClient, times(1)).disconnectUser(captor.capture());
        assertThat(captor.getValue()).isEqualTo(memberId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // T4: deleteWorkspace cascade 완전 실증 (AC-1 cascade 안전망)
    // workspaces→memberships, invitations, pages→crdt_ops, snapshots 전체 정리 확인
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("T4/AC-1 cascade: deleteWorkspace → memberships·invitations·pages·crdt_ops·snapshots 전부 삭제, 204 정상 커밋")
    void deleteWorkspace_cascadesAllChildren_pagesCrdtOpsSnapshotsInvitationsMemberships() throws Exception {
        // ── Given ──
        // setUp()에서 이미 생성된: SHARED 워크스페이스 W, OWNER 멤버십, MEMBER 멤버십

        // invitation 1건 (workspaceId=W)
        invitationRepository.save(Invitation.builder()
                .workspaceId(workspaceId)
                .email("invited@cascade.com")
                .invitedById(ownerId)
                .role(MemberRole.MEMBER)
                .token("CASCADE-TOKEN-" + UUID.randomUUID())
                .status(InvitationStatus.PENDING)
                .expiresAt(Instant.now().plusSeconds(86400))
                .build());

        // 활성 page + 아카이브된 page 각 1건 — archived 여부 무관하게 cascade 실증 (security MEDIUM-2 보강)
        Page activePage = pageRepository.save(Page.builder()
                .workspaceId(workspaceId)
                .title("cascade-active-page")
                .position(0)
                .createdById(ownerId)
                .build());
        UUID activePageId = activePage.getId();

        Page archivedPage = pageRepository.save(Page.builder()
                .workspaceId(workspaceId)
                .title("cascade-archived-page")
                .position(1)
                .createdById(ownerId)
                .archivedAt(Instant.now())
                .build());
        UUID archivedPageId = archivedPage.getId();

        // 각 page에 crdt_op 1건 — V3 op_type CHECK는 소문자('insert')를 요구하므로
        // JPA enum(@Enumerated STRING → 대문자) 우회: native SQL 직접 삽입
        for (UUID pid : java.util.List.of(activePageId, archivedPageId)) {
            jdbcTemplate.update(
                    "INSERT INTO crdt_ops (id, page_id, site_id, seq, op_type, payload) " +
                    "VALUES (?::uuid, ?::uuid, ?, ?, 'insert', ?::jsonb)",
                    UUID.randomUUID().toString(), pid.toString(), "site-cascade", 1, "{}");
        }

        // 각 page에 snapshot 1건
        snapshotRepository.save(Snapshot.builder().pageId(activePageId).state("{}").version(1L).build());
        snapshotRepository.save(Snapshot.builder().pageId(archivedPageId).state("{}").version(1L).build());

        // ── When ──
        mockMvc.perform(delete("/api/workspaces/{id}", workspaceId)
                        .with(asUser(OWNER_GOOGLE_ID)))
                .andExpect(status().isNoContent());  // 예외 없이 204 커밋 — flush 순서 안전성 확인

        // ── Then ──
        // 1) 워크스페이스 삭제
        assertThat(workspaceRepository.findById(workspaceId)).isEmpty();

        // 2) memberships — workspaceId 스코프 조회
        assertThat(membershipRepository.findByWorkspaceId(workspaceId)).isEmpty();

        // 3) invitations — workspaceId 스코프 조회
        assertThat(invitationRepository.findByWorkspaceIdOrderByCreatedAtDesc(workspaceId)).isEmpty();

        // 4) pages — archived 포함 전체가 cascade 삭제됨 (findAll 필터로 워크스페이스 스코프 전수 검증)
        assertThat(pageRepository.findAll().stream()
                .filter(p -> p.getWorkspaceId().equals(workspaceId)).toList()).isEmpty();

        // 5) crdt_ops — 활성·아카이브 page 모두 2단계 cascade(workspace→page→crdt_op) 삭제
        assertThat(crdtOpRepository
                .findByPageIdAndServerSeqGreaterThanOrderByServerSeqAsc(activePageId, -1L)).isEmpty();
        assertThat(crdtOpRepository
                .findByPageIdAndServerSeqGreaterThanOrderByServerSeqAsc(archivedPageId, -1L)).isEmpty();

        // 6) snapshots — 활성·아카이브 page 모두 cascade 삭제
        assertThat(snapshotRepository.findTopByPageIdOrderByVersionDesc(activePageId)).isEmpty();
        assertThat(snapshotRepository.findTopByPageIdOrderByVersionDesc(archivedPageId)).isEmpty();
    }

    // ── 라우팅: MEMBER가 /members/{본인UUID} → 403(requireOwner 우선) vs /members/me → 204 ──

    @Test
    @DisplayName("라우팅: MEMBER가 /members/{본인UUID}(removeMember 경로) → 403(requireOwner 우선·MEMBER 비OWNER), /members/me → 204 — 두 경로(핸들러) 결과 상이")
    void routing_selfRemoveViaUuidBlocked_butLeaveViaMeSucceeds() throws Exception {
        // /members/{본인UUID} → removeMember 핸들러 → requireOwner 우선 → MEMBER는 403
        // (자기제거 차단 BR-3는 OWNER가 requireOwner 통과 후에만 도달. 권한 우선·존재 비누설 — P9 일관)
        mockMvc.perform(delete("/api/workspaces/{id}/members/{userId}", workspaceId, memberId)
                        .with(asUser(MEMBER_GOOGLE_ID)))
                .andExpect(status().isForbidden());

        // 멤버십은 아직 살아있어야 함
        assertThat(membershipRepository.findByUserIdAndWorkspaceId(memberId, workspaceId)).isPresent();

        // /members/me → 204
        mockMvc.perform(delete("/api/workspaces/{id}/members/me", workspaceId)
                        .with(asUser(MEMBER_GOOGLE_ID)))
                .andExpect(status().isNoContent());

        // 이제 멤버십 삭제됨
        assertThat(membershipRepository.findByUserIdAndWorkspaceId(memberId, workspaceId)).isEmpty();
    }
}
