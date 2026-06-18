package com.ieum.workspace;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.UUID;

/**
 * 워크스페이스 멤버십 엔티티
 * userId + workspaceId 조합은 유니크 제약
 */
@Entity
@Table(
    name = "memberships",
    uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "workspace_id"})
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Membership {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private UUID userId;

    @Column(nullable = false)
    private UUID workspaceId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private MemberRole role;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private Instant joinedAt;
}
