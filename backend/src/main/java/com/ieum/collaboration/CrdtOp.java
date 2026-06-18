package com.ieum.collaboration;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.type.SqlTypes;
import org.hibernate.annotations.JdbcTypeCode;

import java.time.Instant;
import java.util.UUID;

/**
 * CRDT 연산 로그 엔티티
 * server_seq는 DB IDENTITY로 자동 채번 — 앱에서 insertable/updatable 불가
 */
@Entity
@Table(
    name = "crdt_ops",
    uniqueConstraints = @UniqueConstraint(columnNames = {"page_id", "site_id", "seq"})
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CrdtOp {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private UUID pageId;

    @Column(nullable = false)
    private String siteId;

    @Column(nullable = false)
    private int seq;

    /** DB GENERATED ALWAYS AS IDENTITY — 앱에서 쓰기 불가 */
    @Column(insertable = false, updatable = false)
    private Long serverSeq;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private OpType opType;

    /** CRDT 연산 페이로드 (jsonb) */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false)
    private String payload;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private Instant createdAt;
}
