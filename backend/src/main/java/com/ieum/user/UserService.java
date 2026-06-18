package com.ieum.user;

import com.ieum.workspace.WorkspaceService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final WorkspaceService workspaceService;

    @Transactional
    public User loginWithOAuth(OAuthUserInfo info) {
        User user = upsert(info);
        workspaceService.ensurePersonalWorkspace(user.getId());
        return user;
    }

    @Transactional
    public User upsert(OAuthUserInfo info) {
        return userRepository.findByGoogleId(info.googleId())
                .map(u -> {
                    u.setName(info.name());
                    u.setEmail(info.email());
                    u.setImage(info.image());
                    return userRepository.save(u);
                })
                .orElseGet(() -> userRepository.save(User.builder()
                        .googleId(info.googleId())
                        .email(info.email())
                        .name(info.name())
                        .image(info.image())
                        .build()));
    }
}
