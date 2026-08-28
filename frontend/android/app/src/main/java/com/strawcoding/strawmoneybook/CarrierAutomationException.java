package com.strawcoding.strawmoneybook;

import org.json.JSONObject;

public class CarrierAutomationException extends Exception {
    private final String code;
    private JSONObject data;

    public CarrierAutomationException(String code, String message) {
        super(message == null ? "" : message.trim());
        this.code = code == null ? "carrier_automation_error" : code.trim();
    }

    public String getCode() {
        return code;
    }

    public JSONObject getData() {
        return data == null ? new JSONObject() : data;
    }

    public void attachData(JSONObject data) {
        this.data = data == null ? new JSONObject() : data;
    }
}
