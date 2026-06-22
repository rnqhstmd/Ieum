package com.ieum.workspace;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ieum.page.PageRepository;
import com.ieum.support.AbstractIntegrationTest;
import com.ieum.user.User;
import com.ieum.user.UserRepository;
import com.ieum.workspace.dto.UpdateMemberRoleRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * GET /api/workspaces/{id}/members — 멤버 목록 조회 통합 테스트
 * AC-1: OWNER → 200, 멤버 2건 (userId·role·joinedAt 존재)
 * AC-2: MEMBER → 200, 멤버 2건
 * AC-3: 비멤버 → 403
 */
@AutoConfigureMockMvc
class MemberManagementIntegrationTest extends AbstractIntegrationTest {

    @Autowired private MockMvc mockMvc;
    private final ObjectMapper objectMapper = new ObjectMapper();
    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private MembershipRepository membershipRepository;
    @Autowired private PageRepository pageRepository;

    // WsRelayAdminClient를 mock으로 교체 → 실 HTTP 요청 차단, admin-url 무관하게 no-op
    @MockitoBean
    private WsRelayAdminClient wsRelayAdminClient;

    private static final String OWNER_GOOGLE_ID  = "G-MMT-OWNER";
    private static final String MEMBER_GOOGLE_ID = "G-MMT-MEMBER";
    private static final String OTHER_GOOGLE_ID  = "G-MMT-OTHER";

    private UUID workspaceId;
    private UUID ownerId;
    private UUID memberId;

    @BeforeEach
    void setUp() {
        // FK 순서: page → membership → workspace → user
        pageRepository.deleteAll();
        membershipRepository.deleteAll();
        workspaceRepository.deleteAll();
        userRepository.deleteAll();

        // 사용자 3명 생성: OWNER, MEMBER, 비멤버
        User owner = userRepository.save(User.builder()
                .googleId(OWNER_GOOGLE_ID).email("owner@mmt.com").name("OWNER유저").image("img").build());
        User member = userRepository.save(User.builder()
                .googleId(MEMBER_GOOGLE_ID).email("member@mmt.com").name("MEMBER유저").image("img").build());
        userRepository.save(User.builder()
                .googleId(OTHER_GOOGLE_ID).email("other@mmt.com").name("비멤버유저").image("img").build());

        ownerId  = owner.getId();
        memberId = member.getId();

        // SHARED 워크스페이스 생성
        Workspace workspace = workspaceRepository.save(Workspace.builder()
                .name("테스트팀").type(WorkspaceType.SHARED).ownerId(ownerId).build());
        workspaceId = workspace.getId();

        // OWNER·MEMBER 멤버십 2건 생성
        membershipRepository.save(Membership.builder()
                .userId(ownerId).workspaceId(workspaceId).role(MemberRole.OWNER).build());
        membershipRepository.save(Membership.builder()
                .userId(memberId).workspaceId(workspaceId).role(MemberRole.MEMBER).build());
    }

    private static RequestPostProcessor asUser(String googleId) {
        return oauth2Login().attributes(a -> a.put("sub", googleId));
    }

    // ── AC-1: OWNER → 200, 멤버 2건 ──────────────────────────────────

    @Test
    @DisplayName("AC-1: OWNER가 GET .../members → 200, 멤버 배열 2건, userId·role·joinedAt 존재")
    void owner_getMembers_returns200_withTwoMembers() throws Exception {
        mockMvc.perform(get("/api/workspaces/{id}/members", workspaceId)
                        .with(asUser(OWNER_GOOGLE_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].userId").exists())
                .andExpect(jsonPath("$[0].role").exists())
                .andExpect(jsonPath("$[0].joinedAt").exists());
    }

    // ── AC-2: MEMBER → 200, 멤버 2건 ────────────────────────────────

    @Test
    @DisplayName("AC-2: MEMBER가 GET .../members → 200, 멤버 배열 2건")
    void member_getMembers_returns200_withTwoMembers() throws Exception {
        mockMvc.perform(get("/api/workspaces/{id}/members", workspaceId)
                        .with(asUser(MEMBER_GOOGLE_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));
    }

    // ── AC-3: 비멤버 → 403 ───────────────────────────────────────────

    @Test
    @DisplayName("AC-3: 비멤버가 GET .../members → 403")
    void nonMember_getMembers_returns403() throws Exception {
        mockMvc.perform(get("/api/workspaces/{id}/members", workspaceId)
                        .with(asUser(OTHER_GOOGLE_ID)))
                .andExpect(status().isForbidden());
    }

    // ══════════════════════════════════════════════════════════════════
    // PATCH /api/workspaces/{id}/members/{userId}/role 통합 테스트 (T3)
    // ══════════════════════════════════════════════════════════════════

    // ── AC-4(통합): OWNER가 MEMBER를 OWNER로 승격 → 200, role=OWNER, DB 반영 ─

    @Test
    @DisplayName("AC-4(통합): OWNER가 MEMBER를 OWNER로 승격 → 200, 응답 role=OWNER, DB role=OWNER")
    void owner_promoteMemberToOwner_returns200_andDbUpdated() throws Exception {
        String body = objectMapper.writeValueAsString(new UpdateMemberRoleRequest(MemberRole.OWNER));

        mockMvc.perform(patch("/api/workspaces/{id}/members/{userId}/role", workspaceId, memberId)
                        .with(asUser(OWNER_GOOGLE_ID))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("OWNER"))
                .andExpect(jsonPath("$.userId").value(memberId.toString()));

        // DB 검증
        Membership updated = membershipRepository
                .findByUserIdAndWorkspaceId(memberId, workspaceId).orElseThrow();
        assertThat(updated.getRole()).isEqualTo(MemberRole.OWNER);
    }

    // ── AC-7(통합): 마지막 OWNER 강등 시도 → 400, 메시지, DB 유지 ─────

    @Test
    @DisplayName("AC-7(통합): 마지막 OWNER가 자신을 MEMBER로 강등 → 400, 메시지 포함, DB role=OWNER 유지")
    void lastOwner_demoteSelf_returns400_andDbUnchanged() throws Exception {
        // 먼저 MEMBER를 삭제하여 OWNER 1명만 남김
        membershipRepository.findByUserIdAndWorkspaceId(memberId, workspaceId)
                .ifPresent(membershipRepository::delete);

        String body = objectMapper.writeValueAsString(new UpdateMemberRoleRequest(MemberRole.MEMBER));

        mockMvc.perform(patch("/api/workspaces/{id}/members/{userId}/role", workspaceId, ownerId)
                        .with(asUser(OWNER_GOOGLE_ID))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("마지막 OWNER의 역할을 변경할 수 없습니다"));

        // DB 검증: OWNER role 유지
        Membership unchanged = membershipRepository
                .findByUserIdAndWorkspaceId(ownerId, workspaceId).orElseThrow();
        assertThat(unchanged.getRole()).isEqualTo(MemberRole.OWNER);
    }

    // ── AC-8(통합): 존재하지 않는 대상 → 404 ────────────────────────────

    @Test
    @DisplayName("AC-8(통합): 존재하지 않는 userId로 역할 변경 → 404")
    void updateMemberRole_nonExistentTarget_returns404() throws Exception {
        UUID ghostId = UUID.randomUUID();
        String body = objectMapper.writeValueAsString(new UpdateMemberRoleRequest(MemberRole.MEMBER));

        mockMvc.perform(patch("/api/workspaces/{id}/members/{userId}/role", workspaceId, ghostId)
                        .with(asUser(OWNER_GOOGLE_ID))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isNotFound());
    }

    // ── AC-17(통합): MEMBER가 역할 변경 시도 → 403 ───────────────────────

    @Test
    @DisplayName("AC-17(통합): MEMBER가 다른 멤버 역할 변경 시도 → 403")
    void member_updateRole_returns403() throws Exception {
        String body = objectMapper.writeValueAsString(new UpdateMemberRoleRequest(MemberRole.OWNER));

        mockMvc.perform(patch("/api/workspaces/{id}/members/{userId}/role", workspaceId, ownerId)
                        .with(asUser(MEMBER_GOOGLE_ID))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isForbidden());
    }

    // ── AC-19(통합): 비멤버가 역할 변경 시도 → 403 ───────────────────────

    @Test
    @DisplayName("AC-19(통합): 비멤버가 역할 변경 시도 → 403")
    void nonMember_updateRole_returns403() throws Exception {
        String body = objectMapper.writeValueAsString(new UpdateMemberRoleRequest(MemberRole.OWNER));

        mockMvc.perform(patch("/api/workspaces/{id}/members/{userId}/role", workspaceId, memberId)
                        .with(asUser(OTHER_GOOGLE_ID))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isForbidden());
    }

    // ══════════════════════════════════════════════════════════════════
    // DELETE /api/workspaces/{id}/members/{userId} 통합 테스트 (T4)
    // ══════════════════════════════════════════════════════════════════

    // ── AC-9(통합): OWNER A가 MEMBER B 제거 → 204, DB B Membership 삭제 ─

    @Test
    @DisplayName("AC-9(통합): OWNER A가 MEMBER B 제거 → 204, DB에서 B Membership 삭제됨")
    void owner_removeMember_returns204_andDbDeleted() throws Exception {
        mockMvc.perform(delete("/api/workspaces/{id}/members/{userId}", workspaceId, memberId)
                        .with(asUser(OWNER_GOOGLE_ID)))
                .andExpect(status().isNoContent());

        // DB 검증: B Membership 삭제됨
        assertThat(membershipRepository.findByUserIdAndWorkspaceId(memberId, workspaceId))
                .isEmpty();
    }

    // ── AC-10(통합): OWNER A가 자기 자신 제거 시도 → 400, 메시지, A Membership 유지 ─

    @Test
    @DisplayName("AC-10(통합): OWNER A가 자기(A) 제거 시도 → 400, '자기 자신을 제거할 수 없습니다', A Membership 유지")
    void owner_removeSelf_returns400_andMembershipRetained() throws Exception {
        mockMvc.perform(delete("/api/workspaces/{id}/members/{userId}", workspaceId, ownerId)
                        .with(asUser(OWNER_GOOGLE_ID)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("자기 자신을 제거할 수 없습니다"));

        // DB 검증: A Membership 유지
        assertThat(membershipRepository.findByUserIdAndWorkspaceId(ownerId, workspaceId))
                .isPresent();
    }

    // ── AC-11(통합): 단독 OWNER A가 자기 제거 시도 → 400 (BR-3가 BR-2 선행) ─

    @Test
    @DisplayName("AC-11(통합): 단독 OWNER A가 자기 제거 시도 → 400, BR-3('자기 자신을 제거할 수 없습니다')가 BR-2보다 선행")
    void soleOwner_removeSelf_returns400_br3BeforeBr2() throws Exception {
        // 단독 OWNER 상태: MEMBER를 미리 제거
        membershipRepository.findByUserIdAndWorkspaceId(memberId, workspaceId)
                .ifPresent(membershipRepository::delete);

        mockMvc.perform(delete("/api/workspaces/{id}/members/{userId}", workspaceId, ownerId)
                        .with(asUser(OWNER_GOOGLE_ID)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("자기 자신을 제거할 수 없습니다"));
    }

    // ── AC-13(통합): 비멤버(워크스페이스 미가입) 대상 제거 → 404 ──────────

    @Test
    @DisplayName("AC-13(통합): OWNER가 워크스페이스 비멤버 대상 제거 시도 → 404")
    void owner_removeNonMember_returns404() throws Exception {
        UUID ghostId = UUID.randomUUID();

        mockMvc.perform(delete("/api/workspaces/{id}/members/{userId}", workspaceId, ghostId)
                        .with(asUser(OWNER_GOOGLE_ID)))
                .andExpect(status().isNotFound());
    }

    // ── AC-18(통합): MEMBER B가 C 제거 시도 → 403 ───────────────────────

    @Test
    @DisplayName("AC-18(통합): MEMBER B가 타 멤버 제거 시도 → 403")
    void member_removeMember_returns403() throws Exception {
        mockMvc.perform(delete("/api/workspaces/{id}/members/{userId}", workspaceId, ownerId)
                        .with(asUser(MEMBER_GOOGLE_ID)))
                .andExpect(status().isForbidden());
    }
}
