package com.strawcoding.strawmoneybook.wear;

/**
 * Application-layer MessageClient policy. Incoming and outgoing Wear payloads
 * are handled only when the peer Node is currently nearby (directly connected).
 * This is not a Bluetooth-only or "never Google relay" guarantee.
 */
public final class WearMessageDispatcher {
    private WearMessageDispatcher() {}

    public static boolean shouldHandleIncoming(boolean sourceNearby, String path) {
        return WearNearbyPolicy.maySendWearPayload(sourceNearby)
            && WearCompanionConstants.isAllowedPath(path);
    }

    public static boolean shouldSendReply(boolean targetNearby, String path) {
        return WearNearbyPolicy.maySendWearPayload(targetNearby)
            && WearCompanionConstants.isAllowedPath(path);
    }
}
