package com.strawcoding.strawmoneybook.wear;

/**
 * Application-layer nearby-first policy.
 * Node.isNearby() means currently directly connected; it is not a Bluetooth-only
 * or "never Google relay" guarantee. MessageClient has no NEARBY_ONLY flag.
 */
public final class WearNearbyPolicy {
    private WearNearbyPolicy() {}

    public static boolean maySendWearPayload(boolean isNearby) {
        return isNearby;
    }
}
