package com.finsight.copilot;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class GroqCopilotModelTest {

    private final GroqCopilotModel model = new GroqCopilotModel(new ObjectMapper(), "test-key", "test-model");

    private final Map<String, Object> request = Map.of(
            "store", false, "include", List.of("reasoning.encrypted_content"),
            "instructions", "Use only the tool output.",
            "tool_choice", "auto", "parallel_tool_calls", false, "tools", List.of(Map.of("name", "lookup")),
            "text", Map.of("format", Map.of("type", "json_schema")),
            "input", List.of(Map.of("role", "user", "content", "Check my synthetic account"),
                    Map.of("type", "reasoning"), Map.of("type", "function_call"),
                    Map.of("type", "function_call_output", "call_id", "synthetic", "output", "42")));

    @Test
    void sendsToolsSeparatelyFromTheFinalJsonSchema() {
        var lookup = model.payload(request, true);
        var answer = model.payload(request, false);

        assertThat(lookup.has("tools")).isTrue();
        assertThat(lookup.has("text")).isFalse();
        assertThat(answer.has("tools")).isFalse();
        assertThat(answer.has("parallel_tool_calls")).isFalse();
        assertThat(answer.path("text").path("format").path("type").asText()).isEqualTo("json_schema");
    }

    @Test
    void dropsUnsupportedFieldsWithoutDroppingToolResults() {
        var lookup = model.payload(request, true);

        assertThat(lookup.has("store")).isFalse();
        assertThat(lookup.has("include")).isFalse();
        assertThat(lookup.path("input")).hasSize(3);
        assertThat(lookup.path("input").get(2).path("type").asText()).isEqualTo("function_call_output");
    }
}
