package com.finsight.common.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ApiResponse<T>(
    boolean success,
    T data,
    ErrorDetails error,
    Meta meta
) {
    public record ErrorDetails(
        String code,
        String message,
        List<FieldError> details
    ) {}

    public record FieldError(
        String field,
        String message
    ) {}

    public record Meta(
        Instant timestamp,
        String requestId
    ) {}

    public static <T> ApiResponse<T> success(T data) {
        return new ApiResponse<>(true, data, null, new Meta(Instant.now(), null));
    }

    public static <T> ApiResponse<T> error(String code, String message) {
        return new ApiResponse<>(false, null, new ErrorDetails(code, message, null), new Meta(Instant.now(), null));
    }

    public static <T> ApiResponse<T> validationError(String message, List<FieldError> details) {
        return new ApiResponse<>(false, null, new ErrorDetails("VALIDATION_ERROR", message, details), new Meta(Instant.now(), null));
    }
}

