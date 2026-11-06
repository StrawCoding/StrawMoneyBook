package com.strawcoding.strawmoneybook.core;

/**
 * Emits bank automation progress to Capacitor (main thread). Automation runs on a
 * background executor; WebView work is marshalled to the UI thread separately.
 */
public final class BankAutomationProgressBridge {
    public interface Emitter {
        void emit(String action, String providerId, int percent, String stage, String message);
    }

    private static volatile Emitter emitter;

    private BankAutomationProgressBridge() {}

    public static void setEmitter(Emitter next) {
        emitter = next;
    }

    public static void report(String action, String providerId, int percent, String stage, String message) {
        Emitter target = emitter;
        if (target == null) return;
        int clamped = Math.max(0, Math.min(100, percent));
        String safeAction = action == null ? "" : action.trim();
        String safeProvider = providerId == null ? "" : providerId.trim();
        String safeStage = stage == null ? "" : stage.trim();
        String safeMessage = message == null ? "" : message.trim();
        target.emit(safeAction, safeProvider, clamped, safeStage, safeMessage);
    }
}
