package com.finsight.identity.dto;

import com.finsight.identity.entity.User;
import java.util.UUID;

public record UserResponse(
    UUID id,
    String email,
    String displayName,
    String baseCurrency,
    String timeZone,
    String locale
) {
    public static UserResponse fromEntity(User user) {
        return new UserResponse(
            user.getId(),
            user.getEmail(),
            user.getDisplayName(),
            user.getBaseCurrency(),
            user.getTimeZone(),
            user.getLocale()
        );
    }
}

