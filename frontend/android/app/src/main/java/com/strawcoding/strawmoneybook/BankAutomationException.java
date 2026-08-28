package com.strawcoding.strawmoneybook;

import org.json.JSONObject;

public class BankAutomationException extends Exception {
    private final String code;
    private JSONObject data;

    public BankAutomationException(String code, String message) {
        super(message == null ? "" : message.trim());
        this.code = code == null ? "bank_automation_error" : code.trim();
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
