package com.finsight.identity.service;

import com.finsight.identity.entity.AccountStatus;
import com.finsight.identity.repository.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

@Component
@Profile("local")
class LocalDemoCredentials implements ApplicationRunner {

    static final UUID DEMO_ID = UUID.fromString("11111111-1111-1111-1111-111111111111");
    static final String DEMO_EMAIL = "divyanshu@finsight.local";

    private final UserRepository users;
    private final PasswordEncoder passwords;
    private final JdbcClient jdbc;
    private final String password;

    LocalDemoCredentials(UserRepository users, PasswordEncoder passwords, JdbcClient jdbc,
                         @Value("${DEMO_PASSWORD:}") String password) {
        this.users = users;
        this.passwords = passwords;
        this.jdbc = jdbc;
        this.password = password;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        var user = users.findById(DEMO_ID).filter(candidate -> DEMO_EMAIL.equals(candidate.getEmail()));
        if (user.isEmpty()) {
            return;
        }

        var demo = user.get();
        if (password.isBlank()) {
            if (demo.getAccountStatus() == AccountStatus.ACTIVE) {
                demo.setAccountStatus(AccountStatus.SUSPENDED);
                demo.setPasswordHash("disabled");
                revokeRefreshTokens();
            }
            return;
        }

        int bytes = password.getBytes(StandardCharsets.UTF_8).length;
        if (bytes < 16 || bytes > 72) {
            throw new IllegalStateException("DEMO_PASSWORD must be between 16 and 72 UTF-8 bytes.");
        }
        if (demo.getAccountStatus() == AccountStatus.ACTIVE && passwords.matches(password, demo.getPasswordHash())) {
            return;
        }

        demo.setPasswordHash(passwords.encode(password));
        demo.setAccountStatus(AccountStatus.ACTIVE);
        revokeRefreshTokens();
    }

    private void revokeRefreshTokens() {
        jdbc.sql("UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = :id AND revoked_at IS NULL")
                .param("id", DEMO_ID).update();
    }
}
