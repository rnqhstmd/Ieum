package com.ieum.invitation.dto;

import com.ieum.workspace.MemberRole;

/**
 * 초대 생성 요청 DTO
 */
public record CreateInvitationRequest(
        String email,
        MemberRole role
) {}
