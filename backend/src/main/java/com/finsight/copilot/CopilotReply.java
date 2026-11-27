package com.finsight.copilot;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

record CopilotReply(String answer, List<String> sourceRefs) {

    static final int MAX_ANSWER_LENGTH = 4_000;

    static Optional<CopilotReply> parse(ObjectMapper json, String output) {
        String text = output.strip();
        if (text.startsWith("```json\n") && text.endsWith("```")) {
            text = text.substring(8, text.length() - 3).strip();
        } else if (text.startsWith("```\n") && text.endsWith("```")) {
            text = text.substring(4, text.length() - 3).strip();
        }
        try {
            JsonNode reply = json.readerFor(JsonNode.class).with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                    .readValue(text);
            if (reply == null || !reply.isObject() || reply.size() != 2) {
                return Optional.empty();
            }

            JsonNode answer = reply.path("answer");
            JsonNode refs = reply.path("sourceRefs");
            if (!answer.isTextual() || answer.asText().isBlank() || answer.asText().length() > MAX_ANSWER_LENGTH
                    || !refs.isArray() || refs.size() > 30) {
                return Optional.empty();
            }
            List<String> references = new ArrayList<>();
            for (JsonNode ref : refs) {
                if (!ref.isTextual()) {
                    return Optional.empty();
                }
                references.add(ref.asText());
            }
            return Optional.of(new CopilotReply(answer.asText(), List.copyOf(references)));
        } catch (JsonProcessingException exception) {
            return Optional.empty();
        }
    }
}
