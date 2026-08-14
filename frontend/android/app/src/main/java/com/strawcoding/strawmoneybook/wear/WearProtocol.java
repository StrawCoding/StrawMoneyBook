package com.strawcoding.strawmoneybook.wear;

import org.json.JSONException;
import org.json.JSONObject;

public final class WearProtocol {
    private WearProtocol() {}

    public static JSONObject parseEnvelope(String raw) throws JSONException {
        JSONObject body = new JSONObject(raw);
        int version = body.optInt("protocolVersion", -1);
        if (version != WearCompanionConstants.PROTOCOL_VERSION) {
            throw new JSONException("wear protocolVersion unsupported");
        }
        return body;
    }

    public static WearTxCreate validateTxCreate(JSONObject payload) throws JSONException {
        String idempotencyKey = payload.optString("idempotencyKey", "").trim();
        String ledgerId = payload.optString("ledgerId", "").trim();
        String type = payload.optString("type", "").trim();
        String accountId = payload.optString("accountId", "").trim();
        String categoryId = payload.optString("categoryId", "").trim();
        long amountMinor = payload.optLong("amountMinor", 0L);
        if (idempotencyKey.isEmpty() || ledgerId.isEmpty() || accountId.isEmpty() || categoryId.isEmpty()) {
            throw new JSONException("rejected: missing fields");
        }
        if (!"expense".equals(type) && !"income".equals(type)) {
            throw new JSONException("rejected: type");
        }
        if (amountMinor <= 0L) {
            throw new JSONException("rejected: amountMinor");
        }
        if (!payload.has("catalogRevision")) {
            throw new JSONException("rejected: catalogRevision");
        }
        WearTxCreate parsed = new WearTxCreate();
        parsed.idempotencyKey = idempotencyKey;
        parsed.clientTxId = payload.optString("clientTxId", "").trim();
        parsed.ledgerId = ledgerId;
        parsed.type = type;
        parsed.accountId = accountId;
        parsed.categoryId = categoryId;
        parsed.amountMinor = amountMinor;
        parsed.catalogRevision = payload.optLong("catalogRevision");
        parsed.occurredAt = payload.optString("occurredAt", "").trim();
        parsed.note = payload.optString("note", "");
        if (parsed.note.length() > 200) {
            parsed.note = parsed.note.substring(0, 200);
        }
        return parsed;
    }

    public static JSONObject ack(String status, String idempotencyKey, String txId, String error) throws JSONException {
        JSONObject ack = new JSONObject();
        ack.put("protocolVersion", WearCompanionConstants.PROTOCOL_VERSION);
        ack.put("msg", "tx.ack");
        ack.put("status", status);
        ack.put("idempotencyKey", idempotencyKey);
        if (txId != null) {
            ack.put("txId", txId);
        }
        if (error != null) {
            ack.put("error", error);
        }
        return ack;
    }

    public static boolean shouldApplySnapshot(String localEpoch, long localRevision, String incomingEpoch, long incomingRevision) {
        if (incomingEpoch == null || incomingEpoch.isEmpty()) {
            return false;
        }
        if (!incomingEpoch.equals(String.valueOf(localEpoch))) {
            return true;
        }
        return incomingRevision > localRevision;
    }

    public static final class WearTxCreate {
        public String idempotencyKey;
        public String clientTxId;
        public String ledgerId;
        public String type;
        public String accountId;
        public String categoryId;
        public long amountMinor;
        public long catalogRevision;
        public String occurredAt;
        public String note;
    }
}
