package com.strawcoding.strawmoneybook.wear;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import org.json.JSONObject;
import org.junit.Test;

public class WearCompanionPolicyTest {
    @Test
    public void nearbyFirstBlocksNonNearbySend() {
        assertFalse(WearNearbyPolicy.maySendWearPayload(false));
        assertTrue(WearNearbyPolicy.maySendWearPayload(true));
    }

    @Test
    public void pathWhitelistAllowsOnlySmbV1Contract() {
        assertTrue(WearCompanionConstants.isAllowedPath("/smb/v1/tx/create"));
        assertTrue(WearCompanionConstants.isAllowedPath("/smb/v1/hello"));
        assertFalse(WearCompanionConstants.isAllowedPath("/smb/v1/tx/unknown"));
        assertFalse(WearCompanionConstants.isAllowedPath("/DataLayer"));
    }

    @Test
    public void identityMapsIdempotencyKeyNotClientTxId() {
        assertEquals("wear:abc-uuid", WearCompanionConstants.externalRefId("abc-uuid"));
    }

    @Test
    public void incomingAndReplyRequireNearbyPlusWhitelist() {
        assertFalse(WearMessageDispatcher.shouldHandleIncoming(false, "/smb/v1/tx/create"));
        assertTrue(WearMessageDispatcher.shouldHandleIncoming(true, "/smb/v1/tx/create"));
        assertFalse(WearMessageDispatcher.shouldSendReply(true, "/smb/v1/secret"));
        assertTrue(WearMessageDispatcher.shouldSendReply(true, "/smb/v1/tx/ack"));
    }

    @Test
    public void snapshotEpochChangeAcceptsEvenIfRevisionGoesBackwards() {
        assertTrue(WearProtocol.shouldApplySnapshot("epoch-a", 9L, "epoch-b", 1L));
        assertFalse(WearProtocol.shouldApplySnapshot("epoch-a", 9L, "epoch-a", 9L));
        assertTrue(WearProtocol.shouldApplySnapshot("epoch-a", 9L, "epoch-a", 10L));
        assertFalse(WearProtocol.shouldApplySnapshot("epoch-a", 9L, "", 99L));
    }

    @Test
    public void validateTxCreateRejectsTransferAndRequiresIdempotencyKey() throws Exception {
        JSONObject transfer = new JSONObject();
        transfer.put("idempotencyKey", "k1");
        transfer.put("ledgerId", "l1");
        transfer.put("type", "transfer");
        transfer.put("accountId", "a1");
        transfer.put("categoryId", "c1");
        transfer.put("amountMinor", 100);
        transfer.put("catalogRevision", 1);
        try {
            WearProtocol.validateTxCreate(transfer);
            fail("transfer must be rejected");
        } catch (Exception expected) {
            assertTrue(expected.getMessage().contains("type"));
        }

        JSONObject ok = new JSONObject();
        ok.put("idempotencyKey", "k1");
        ok.put("clientTxId", "room-pk-only");
        ok.put("ledgerId", "l1");
        ok.put("type", "expense");
        ok.put("accountId", "a1");
        ok.put("categoryId", "c1");
        ok.put("amountMinor", 2500);
        ok.put("catalogRevision", 3);
        WearProtocol.WearTxCreate parsed = WearProtocol.validateTxCreate(ok);
        assertEquals("k1", parsed.idempotencyKey);
        assertEquals("room-pk-only", parsed.clientTxId);
        assertEquals("wear:k1", WearCompanionConstants.externalRefId(parsed.idempotencyKey));
    }
}
