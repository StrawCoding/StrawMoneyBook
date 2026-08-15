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
    public void validateTxCreateRequiresPeerForTransferAndAcceptsExpense() throws Exception {
        JSONObject transfer = new JSONObject();
        transfer.put("idempotencyKey", "k1");
        transfer.put("ledgerId", "l1");
        transfer.put("type", "transfer");
        transfer.put("accountId", "a1");
        transfer.put("amountMinor", 100);
        transfer.put("catalogRevision", 1);
        try {
            WearProtocol.validateTxCreate(transfer);
            fail("transfer without peer must be rejected");
        } catch (Exception expected) {
            assertTrue(expected.getMessage().contains("peer"));
        }

        JSONObject transferOk = new JSONObject();
        transferOk.put("idempotencyKey", "k-tf");
        transferOk.put("ledgerId", "l1");
        transferOk.put("type", "transfer");
        transferOk.put("accountId", "a1");
        transferOk.put("peerAccountId", "a2");
        transferOk.put("amountMinor", 100);
        transferOk.put("catalogRevision", 1);
        transferOk.put("isReimbursable", true);
        WearProtocol.WearTxCreate transferParsed = WearProtocol.validateTxCreate(transferOk);
        assertEquals("transfer", transferParsed.type);
        assertFalse(transferParsed.isReimbursable);

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
        assertFalse(parsed.isReimbursable);
    }

    @Test
    public void validateTxCreateAcceptsExpenseReimbursableFlag() throws Exception {
        JSONObject ok = new JSONObject();
        ok.put("idempotencyKey", "k-reimb");
        ok.put("ledgerId", "l1");
        ok.put("type", "expense");
        ok.put("accountId", "a1");
        ok.put("categoryId", "c1");
        ok.put("amountMinor", 1200);
        ok.put("catalogRevision", 1);
        ok.put("isReimbursable", true);
        WearProtocol.WearTxCreate parsed = WearProtocol.validateTxCreate(ok);
        assertTrue(parsed.isReimbursable);
        assertFalse(parsed.includeInBudget);
        assertFalse(parsed.includeInAnalysis);

        JSONObject income = new JSONObject();
        income.put("idempotencyKey", "k-inc");
        income.put("ledgerId", "l1");
        income.put("type", "income");
        income.put("accountId", "a1");
        income.put("categoryId", "c2");
        income.put("amountMinor", 1200);
        income.put("catalogRevision", 1);
        income.put("isReimbursable", true);
        WearProtocol.WearTxCreate incomeParsed = WearProtocol.validateTxCreate(income);
        assertFalse(incomeParsed.isReimbursable);
    }
}
