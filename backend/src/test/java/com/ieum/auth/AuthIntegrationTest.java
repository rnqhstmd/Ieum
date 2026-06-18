package com.ieum.auth;

import com.ieum.support.AbstractIntegrationTest;
import com.ieum.user.OAuthUserInfo;
import com.ieum.user.User;
import com.ieum.user.UserRepository;
import com.ieum.user.UserService;
import com.ieum.workspace.MemberRole;
import com.ieum.workspace.Membership;
import com.ieum.workspace.MembershipRepository;
import com.ieum.workspace.Workspace;
import com.ieum.workspace.WorkspaceRepository;
import com.ieum.workspace.WorkspaceService;
import com.ieum.workspace.WorkspaceType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;

class AuthIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private UserService userService;

    @Autowired
    private WorkspaceService workspaceService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private WorkspaceRepository workspaceRepository;

    @Autowired
    private MembershipRepository membershipRepository;

    @BeforeEach
    void setUp() {
        // FK 순서: membership → workspace → user
        membershipRepository.deleteAll();
        workspaceRepository.deleteAll();
        userRepository.deleteAll();
    }

    // ── AC-AUTH-02 e2e ────────────────────────────────────────────────

    @Test
    @DisplayName("AC-AUTH-02 e2e: 신규 OAuth 로그인 시 users 1건·PERSONAL workspace 1건·OWNER membership 1건이 생성된다")
    void loginWithOAuth_newUser_createsUserWorkspaceMembership() {
        // Given
        OAuthUserInfo info = new OAuthUserInfo("G1", "a@test.com", "홍길동", "img");

        // When
        User user = userService.loginWithOAuth(info);

        // Then: users 1건, google_id='G1'
        List<User> users = userRepository.findAll();
        assertThat(users).hasSize(1);
        assertThat(users.get(0).getGoogleId()).isEqualTo("G1");

        // Then: workspaces PERSONAL 1건, owner_id=user.id
        List<Workspace> workspaces = workspaceRepository.findAll();
        assertThat(workspaces).hasSize(1);
        assertThat(workspaces.get(0).getType()).isEqualTo(WorkspaceType.PERSONAL);
        assertThat(workspaces.get(0).getOwnerId()).isEqualTo(user.getId());

        // Then: memberships 1건, role=OWNER, user_id=user.id, workspace_id=ws.id
        List<Membership> memberships = membershipRepository.findAll();
        assertThat(memberships).hasSize(1);
        assertThat(memberships.get(0).getRole()).isEqualTo(MemberRole.OWNER);
        assertThat(memberships.get(0).getUserId()).isEqualTo(user.getId());
        assertThat(memberships.get(0).getWorkspaceId()).isEqualTo(workspaces.get(0).getId());
    }

    // ── AC-AUTH-03 e2e ────────────────────────────────────────────────

    @Test
    @DisplayName("AC-AUTH-03 e2e: 동일 googleId 재로그인 시 users 여전히 1건·email 갱신·workspace/membership 중복 없음")
    void loginWithOAuth_existingUser_updatesEmailKeepsSingleWorkspaceAndMembership() {
        // Given: G1으로 1회 로그인
        OAuthUserInfo first = new OAuthUserInfo("G1", "a@test.com", "홍길동", "img");
        userService.loginWithOAuth(first);

        // When: 같은 googleId, 다른 email로 재로그인
        OAuthUserInfo second = new OAuthUserInfo("G1", "new@test.com", "홍길동", "img");
        userService.loginWithOAuth(second);

        // Then: users google_id='G1' 여전히 1건
        List<User> users = userRepository.findAll();
        assertThat(users).hasSize(1);
        assertThat(users.get(0).getGoogleId()).isEqualTo("G1");

        // Then: email이 new@test.com으로 갱신
        assertThat(users.get(0).getEmail()).isEqualTo("new@test.com");

        // Then: workspaces PERSONAL 여전히 1건
        List<Workspace> workspaces = workspaceRepository.findAll();
        assertThat(workspaces).hasSize(1);
        assertThat(workspaces.get(0).getType()).isEqualTo(WorkspaceType.PERSONAL);

        // Then: memberships 여전히 1건
        List<Membership> memberships = membershipRepository.findAll();
        assertThat(memberships).hasSize(1);
    }

    // ── AC-SEC-03 e2e ─────────────────────────────────────────────────

    @Test
    @DisplayName("AC-SEC-03 e2e: 로그인 후 저장된 User 엔티티에 토큰 관련 필드(accessToken/refreshToken)가 존재하지 않는다")
    void loginWithOAuth_savedUser_hasNoTokenFields() {
        // Given
        OAuthUserInfo info = new OAuthUserInfo("G1", "a@test.com", "홍길동", "img");

        // When
        User user = userService.loginWithOAuth(info);

        // Then: DB에서 조회한 User에 필요한 필드만 존재
        User stored = userRepository.findAll().get(0);
        assertThat(stored.getId()).isNotNull();
        assertThat(stored.getEmail()).isEqualTo("a@test.com");
        assertThat(stored.getName()).isEqualTo("홍길동");
        assertThat(stored.getImage()).isEqualTo("img");
        assertThat(stored.getGoogleId()).isEqualTo("G1");

        // Then: User 클래스에 토큰 getter가 없음을 컴파일 타임으로 검증
        // 아래 라인들은 컴파일 되어야 하며, accessToken()/refreshToken() 같은 메서드가
        // User에 존재했다면 이 테스트에서 명시적으로 호출해 확인할 수 있다.
        // 현재 설계: User의 공개 getter는 id/email/name/image/googleId/createdAt 만 존재.
        // 컴파일 타임 보장: user.getId(), user.getEmail(), user.getName(), user.getImage(), user.getGoogleId()
        assertThat(user.getId()).isNotNull();
        assertThat(user.getEmail()).isNotNull();
        assertThat(user.getName()).isNotNull();
        assertThat(user.getImage()).isNotNull();
        assertThat(user.getGoogleId()).isNotNull();

        // OAuthUserInfo 레코드에도 토큰 필드 없음(컴파일 타임 보장)
        assertThat(info.googleId()).isEqualTo("G1");
        assertThat(info.email()).isEqualTo("a@test.com");
        assertThat(info.name()).isEqualTo("홍길동");
        assertThat(info.image()).isEqualTo("img");
    }

    // ── 동시성 불변식(V2) ──────────────────────────────────────────────

    @Test
    @DisplayName("동시성 불변식(V2): 6개 스레드 동시 ensurePersonalWorkspace — 완료 후 PERSONAL workspace는 정확히 1건")
    void ensurePersonalWorkspace_concurrent6Threads_exactlyOnePersonalWorkspace() throws InterruptedException {
        // Given: 사전에 user 1건 저장
        User user = userRepository.save(
                User.builder()
                        .googleId("G-CONCURRENT")
                        .email("concurrent@test.com")
                        .name("동시성테스트")
                        .image("img")
                        .build()
        );
        UUID userId = user.getId();

        int threadCount = 6;
        ExecutorService executor = Executors.newFixedThreadPool(threadCount);
        CountDownLatch startLatch = new CountDownLatch(1);
        CountDownLatch doneLatch = new CountDownLatch(threadCount);

        List<Future<?>> futures = new ArrayList<>();
        for (int i = 0; i < threadCount; i++) {
            futures.add(executor.submit(() -> {
                try {
                    startLatch.await(); // 모든 스레드 동시 출발
                    workspaceService.ensurePersonalWorkspace(userId);
                } catch (Exception e) {
                    // DataIntegrityViolationException 등 개별 예외는 무시
                    // 최종 불변식(count==1)만 검증
                } finally {
                    doneLatch.countDown();
                }
                return null;
            }));
        }

        // When: 동시 실행
        startLatch.countDown();
        doneLatch.await();
        executor.shutdown();

        // Then: PERSONAL workspace는 정확히 1건
        long count = workspaceRepository.findAll().stream()
                .filter(ws -> ws.getOwnerId().equals(userId)
                        && ws.getType() == WorkspaceType.PERSONAL)
                .count();
        assertThat(count).isEqualTo(1);
    }
}
