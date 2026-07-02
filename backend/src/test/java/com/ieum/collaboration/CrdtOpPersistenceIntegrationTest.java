package com.ieum.collaboration;

import com.ieum.page.Page;
import com.ieum.page.PageRepository;
import com.ieum.support.AbstractIntegrationTest;
import com.ieum.user.User;
import com.ieum.user.UserRepository;
import com.ieum.workspace.Workspace;
import com.ieum.workspace.WorkspaceRepository;
import com.ieum.workspace.WorkspaceType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.UUID;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * CrdtOp op_type 영속화 통합 테스트 — Testcontainers PostgreSQL
 *
 * AC-3: 5종 opType 각각으로 생성한 CrdtOp를 저장하면 V3 CHECK 제약 위반 없이 저장되고,
 *       DB에 실제 기록된 op_type 원문(native SELECT)이 대응 wire 소문자 문자열이다.
 * AC-4: 저장된 행을 리포지토리로 조회(findById)하면 opType이 대응 OpType으로 정확히 복원된다.
 *
 * (prd.md: D:\SQ\new\.dev\fix-crdt-optype-wire\prd.md)
 */
class CrdtOpPersistenceIntegrationTest extends AbstractIntegrationTest {

    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private PageRepository pageRepository;
    @Autowired private CrdtOpRepository crdtOpRepository;
    @Autowired private JdbcTemplate jdbcTemplate;

    private UUID pageId;

    @BeforeEach
    void setUp() {
        // FK 역순 정리: crdt_ops → pages → workspaces → users
        crdtOpRepository.deleteAll();
        pageRepository.deleteAll();
        workspaceRepository.deleteAll();
        userRepository.deleteAll();

        User owner = userRepository.save(User.builder()
                .googleId("G-CRDT-OWNER").email("crdtowner@test.com").name("CRDT오너").image("img").build());
        UUID ownerId = owner.getId();

        Workspace workspace = workspaceRepository.save(Workspace.builder()
                .name("CRDT테스트워크스페이스").type(WorkspaceType.PERSONAL).ownerId(ownerId).build());
        UUID workspaceId = workspace.getId();

        Page page = pageRepository.save(Page.builder()
                .workspaceId(workspaceId)
                .title("crdt-optype-test-page")
                .position(0)
                .createdById(ownerId)
                .build());
        pageId = page.getId();
    }

    private static Stream<Arguments> opTypeWireMapping() {
        return Stream.of(
                Arguments.of(OpType.INSERT, "insert"),
                Arguments.of(OpType.DELETE, "delete"),
                Arguments.of(OpType.BLOCK_INSERT, "block-insert"),
                Arguments.of(OpType.BLOCK_DELETE, "block-delete"),
                Arguments.of(OpType.BLOCK_SET_TYPE, "block-set-type")
        );
    }

    @ParameterizedTest(name = "[{index}] {0} -> \"{1}\"")
    @MethodSource("opTypeWireMapping")
    @DisplayName("AC-3/AC-4: CrdtOp 저장 시 5종 opType이 wire 소문자로 DB에 저장되고, findById 조회 시 원래 enum으로 복원된다")
    void save_and_reload_persistsWireLowercaseAndRestoresEnum(OpType opType, String expectedWire) {
        // seq를 opType별로 구분해 uq_crdt_ops_page_site_seq(page_id, site_id, seq) 유니크 제약 회피
        int seq = opType.ordinal() + 1;

        CrdtOp op = CrdtOp.builder()
                .pageId(pageId)
                .siteId("site-crdt-optype-test")
                .seq(seq)
                .opType(opType)
                .payload("{}")
                .build();

        // ── When: 저장 (V3 CHECK 제약 위반 시 이 시점에서 예외 발생) ──
        CrdtOp saved = crdtOpRepository.save(op);
        UUID savedId = saved.getId();

        // ── Then (AC-3): native SELECT로 읽은 원문 컬럼값이 wire 소문자 문자열이다 ──
        // (JPA 조회는 컨버터/enum이 문자열을 재래핑해 원문을 은닉하므로 반드시 native SQL로 원문 확인)
        String rawColumnValue = jdbcTemplate.queryForObject(
                "SELECT op_type FROM crdt_ops WHERE id = ?::uuid", String.class, savedId.toString());
        assertThat(rawColumnValue).isEqualTo(expectedWire);

        // ── Then (AC-4): findById로 조회한 opType이 원래 enum으로 복원된다 ──
        CrdtOp reloaded = crdtOpRepository.findById(savedId).orElseThrow();
        assertThat(reloaded.getOpType()).isEqualTo(opType);
    }
}
