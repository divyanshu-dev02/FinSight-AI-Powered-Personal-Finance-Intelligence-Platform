package com.finsight.copilot;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;

@Service
@ConditionalOnProperty(name = "COPILOT_PROVIDER", havingValue = "groq")
class GroqCopilotModel implements CopilotModel {

    private static final URI ENDPOINT = URI.create("https://api.groq.com/openai/v1/responses");
    private final HttpClient client = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1).connectTimeout(Duration.ofSeconds(4)).build();
    private final ObjectMapper json;
    private final String apiKey;
    private final String model;

    GroqCopilotModel(ObjectMapper json, @Value("${COPILOT_GROQ_API_KEY:}") String apiKey,
                     @Value("${COPILOT_GROQ_MODEL:qwen/qwen3.8-27b}") String model) {
        this.json = json;
        this.apiKey = apiKey;
        this.model = model;
    }

    @Override
    public boolean isAvailable() {
        return !apiKey.isBlank() && !model.isBlank();
    }

    @Override
    public String providerName() {
        return "Groq";
    }

    @Override
    public JsonNode respond(Map<String, Object> request) {
        if ("none".equals(request.get("tool_choice"))) {
            return send(payload(request, false));
        }
        JsonNode response = send(payload(request, true));
        for (JsonNode item : response.path("output")) {
            if ("function_call".equals(item.path("type").asText())) {
                return response;
            }
        }

        // Groq accepts either function calling or a structured final response per request.
        return send(payload(request, false));
    }

    ObjectNode payload(Map<String, Object> request, boolean withTools) {
        ObjectNode payload = json.valueToTree(request);
        payload.put("model", model);
        payload.remove("store");
        payload.remove("include");
        var input = json.createArrayNode();
        for (JsonNode item : payload.path("input")) {
            if (!"reasoning".equals(item.path("type").asText())) {
                input.add(item);
            }
        }
        payload.set("input", input);
        if (withTools) {
            payload.remove("text");
            payload.put("instructions", payload.path("instructions").asText()
                    + "\nCall a tool if you need financial evidence.");
        } else {
            payload.remove("tools");
            payload.remove("tool_choice");
            payload.remove("parallel_tool_calls");
            payload.put("instructions", payload.path("instructions").asText()
                    + "\nThis is your final response. Return the answer and sourceRefs as a JSON object.");
        }
        return payload;
    }

    private JsonNode send(ObjectNode payload) {
        try {
            var request = HttpRequest.newBuilder(ENDPOINT).timeout(Duration.ofSeconds(15))
                    .header("Authorization", "Bearer " + apiKey)
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .header("User-Agent", "FinSight-Copilot/1.0")
                    .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(payload))).build();
            var response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() >= 200 && response.statusCode() < 300) {
                return json.readTree(response.body());
            }
            if (response.statusCode() == 429) {
                throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                        "Copilot reached the Groq usage limit. Try again later.");
            }
            if (response.statusCode() == 401 || response.statusCode() == 403) {
                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                        "Groq rejected Copilot’s credentials or request. Check the backend configuration.");
            }
            throw unavailable();
        } catch (IOException exception) {
            throw unavailable();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw unavailable();
        }
    }

    private static ResponseStatusException unavailable() {
        return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Copilot could not complete the request through Groq.");
    }
}
