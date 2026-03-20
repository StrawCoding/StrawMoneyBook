package com.strawcoding.strawmoneybook;

public class BankAutomationException extends Exception {
    private final String code;

    public BankAutomationException(String code, String message) {
        super(message == null ? "" : message.trim());
        this.code = code == null ? "bank_automation_error" : code.trim();
    }

    public String getCode() {
        return code;
    }
}
