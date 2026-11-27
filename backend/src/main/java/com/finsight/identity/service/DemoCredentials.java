package com.finsight.identity.service;

import com.finsight.identity.entity.AccountStatus;
import com.finsight.identity.repository.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

@Component
@Profile({"local", "hosted-demo"})
public class DemoCredentials implements ApplicationRunner {

    static final UUID DEMO_ID = UUID.fromString("11111111-1111-1111-1111-111111111111");
    static final UUID HOSTED_ID = UUID.fromString("d6422a31-8c2d-4cb8-9a56-b0ffccb54bda");
    public static final String HOSTED_EMAIL = "demo@finsight.local";
    static final String DEMO_EMAIL = "divyanshu@finsight.local";

    private final UserRepository users;
    private final PasswordEncoder passwords;
    private final JdbcClient jdbc;
    private final String password;
    private final JdbcTemplate jdbcTemplate;
    private final boolean hostedProfile;
    private final boolean demoLoginEnabled;

    DemoCredentials(UserRepository users, PasswordEncoder passwords, JdbcClient jdbc,
                    JdbcTemplate jdbcTemplate, Environment environment,
                    @Value("${DEMO_LOGIN_ENABLED:false}") boolean demoLoginEnabled,
                    @Value("${DEMO_PASSWORD:}") String password) {
        this.users = users;
        this.passwords = passwords;
        this.jdbc = jdbc;
        this.password = password;
        this.jdbcTemplate = jdbcTemplate;
        this.hostedProfile = environment.acceptsProfiles(Profiles.of("hosted-demo"));
        this.demoLoginEnabled = demoLoginEnabled;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        var demoId = hostedProfile ? HOSTED_ID : DEMO_ID;
        var demoEmail = hostedProfile ? HOSTED_EMAIL : DEMO_EMAIL;
        var user = users.findById(demoId).filter(candidate -> demoEmail.equals(candidate.getEmail()));
        if (user.isEmpty()) {
            return;
        }

        var demo = user.get();
        if (password.isBlank() || (hostedProfile && !demoLoginEnabled)) {
            if (demo.getAccountStatus() == AccountStatus.ACTIVE) {
                demo.setAccountStatus(AccountStatus.SUSPENDED);
                demo.setPasswordHash("disabled");
                revokeRefreshTokens(demoId);
            }
            return;
        }

        int bytes = password.getBytes(StandardCharsets.UTF_8).length;
        if (bytes < 16 || bytes > 72) {
            throw new IllegalStateException("DEMO_PASSWORD must be between 16 and 72 UTF-8 bytes.");
        }
        if (demo.getAccountStatus() != AccountStatus.ACTIVE || !passwords.matches(password, demo.getPasswordHash())) {
            demo.setPasswordHash(passwords.encode(password));
            demo.setAccountStatus(AccountStatus.ACTIVE);
            revokeRefreshTokens(demoId);
        }

        if (hostedProfile) {
            jdbc.sql("SELECT set_config('finsight.demo_mode', 'hosted', true)").query(String.class).single();
            jdbcTemplate.execute((ConnectionCallback<Void>) connection -> {
                ScriptUtils.executeSqlScript(connection, new ClassPathResource("demo/seed.sql"));
                return null;
            });
        }
    }

    private void revokeRefreshTokens(UUID demoId) {
        jdbc.sql("UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = :id AND revoked_at IS NULL")
                .param("id", demoId).update();
    }
}
