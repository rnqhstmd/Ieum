package com.ieum.workspace.dto;

import com.ieum.workspace.MemberRole;

/**
 * 멤버 역할 변경 요청 DTO
 */
public record UpdateMemberRoleRequest(
        MemberRole role
) {}
