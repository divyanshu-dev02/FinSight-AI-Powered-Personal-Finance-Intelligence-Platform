package com.finsight.copilot;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.Map;

public interface CopilotModel {
    boolean isAvailable();
    JsonNode respond(Map<String, Object> request);
}
