package com.ieum.collaboration;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.type.SqlTypes;
import org.hibernate.annotations.JdbcTypeCode;

import java.time.Instant;
import java.util.UUID;

/**
 * 페이지 CRDT 스냅샷 엔티티
 */
@Entity
@Table(name = "snapshots")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Snapshot {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private UUID pageId;

    /** 스냅샷 상태 (jsonb) */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false)
    private String state;

    @Column(nullable = false)
    private Long version;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private Instant createdAt;
}
