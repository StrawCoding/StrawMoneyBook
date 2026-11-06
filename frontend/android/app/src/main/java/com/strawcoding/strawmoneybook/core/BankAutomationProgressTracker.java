package com.strawcoding.strawmoneybook.core;

/** Maps completed sync windows to 1–99% progress (100% reserved for success). */
public final class BankAutomationProgressTracker {
    private final String action;
    private final String providerId;
    private int totalUnits = 1;
    private int completedUnits = 0;

    public BankAutomationProgressTracker(String action, String providerId) {
        this.action = action == null ? "" : action.trim();
        this.providerId = providerId == null ? "" : providerId.trim();
    }

    public void setTotalUnits(int total) {
        totalUnits = Math.max(1, total);
    }

    public void reportPhase(String stage, String message, int percentHint) {
        BankAutomationProgressBridge.report(action, providerId, percentHint, stage, message);
    }

    public void completeWindow(String stage, String message) {
        completedUnits += 1;
        int percent = Math.min(99, (completedUnits * 100) / totalUnits);
        BankAutomationProgressBridge.report(action, providerId, percent, stage, message);
    }

    public void completeSuccess() {
        BankAutomationProgressBridge.report(action, providerId, 100, "success", "");
    }
}
