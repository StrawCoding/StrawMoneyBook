package com.strawcoding.strawmoneybook.wear;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public final class WearProtocol {
    private static final int MAX_TAGS = 12;
    private static final int MAX_TAG_LENGTH = 40;
    private static final int MAX_NOTE_LENGTH = 200;

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
        String peerAccountId = payload.optString("peerAccountId", "").trim();
        if (peerAccountId.isEmpty()) {
            peerAccountId = payload.optString("toAccountId", "").trim();
        }
        String sourceAccountId = payload.optString("sourceAccountId", "").trim();
        long amountMinor = payload.optLong("amountMinor", 0L);

        if (idempotencyKey.isEmpty()) {
            throw new JSONException("rejected: idempotencyKey required");
        }
        if (ledgerId.isEmpty()) {
            throw new JSONException("rejected: ledgerId required");
        }
        if (!WearCompanionConstants.isKnownTxType(type)) {
            throw new JSONException("rejected: type");
        }
        if (accountId.isEmpty()) {
            throw new JSONException("rejected: accountId required");
        }
        if (!payload.has("catalogRevision")) {
            throw new JSONException("rejected: catalogRevision");
        }
        if (WearCompanionConstants.TYPE_ADJUSTMENT.equals(type)) {
            if (amountMinor == 0L) {
                throw new JSONException("rejected: adjustment amountMinor");
            }
        } else if (amountMinor <= 0L) {
            throw new JSONException("rejected: amountMinor");
        }
        if (WearCompanionConstants.requiresCategory(type) && categoryId.isEmpty()) {
            throw new JSONException("rejected: categoryId required");
        }

        String resolvedPeer = peerAccountId;
        if (WearCompanionConstants.TYPE_CREDIT_REPAY.equals(type)) {
            resolvedPeer = sourceAccountId.isEmpty() ? peerAccountId : sourceAccountId;
        }
        if (WearCompanionConstants.requiresPeerAccount(type)) {
            if (resolvedPeer.isEmpty()) {
                throw new JSONException("rejected: peer account required");
            }
            if (resolvedPeer.equals(accountId)) {
                throw new JSONException("rejected: peer account must differ");
            }
        }

        String loanDirection = payload.optString("loanDirection", "").trim();
        String counterpartyName = payload.optString("counterpartyName", "").trim();
        if (WearCompanionConstants.TYPE_LOAN.equals(type)) {
            if (!"lend".equals(loanDirection) && !"borrow".equals(loanDirection)) {
                throw new JSONException("rejected: loanDirection");
            }
            if (counterpartyName.isEmpty()) {
                throw new JSONException("rejected: counterpartyName required");
            }
            if (counterpartyName.length() > 80) {
                counterpartyName = counterpartyName.substring(0, 80);
            }
        }

        WearTxCreate parsed = new WearTxCreate();
        parsed.op = WearCompanionConstants.OP_CREATE;
        parsed.idempotencyKey = idempotencyKey;
        parsed.clientTxId = payload.optString("clientTxId", "").trim();
        parsed.ledgerId = ledgerId;
        parsed.type = type;
        parsed.accountId = accountId;
        parsed.categoryId = categoryId;
        parsed.peerAccountId = resolvedPeer;
        parsed.sourceAccountId = sourceAccountId;
        parsed.amountMinor = amountMinor;
        parsed.catalogRevision = payload.optLong("catalogRevision");
        parsed.occurredAt = payload.optString("occurredAt", "").trim();
        parsed.note = clampNote(payload.optString("note", ""));
        parsed.tags = normalizeTags(payload);
        parsed.loanDirection = loanDirection;
        parsed.counterpartyName = counterpartyName;
        // Reimbursable is expense-only (same as phone Quick Add); other types stay false.
        parsed.isReimbursable = WearCompanionConstants.TYPE_EXPENSE.equals(type)
            && payload.optBoolean("isReimbursable", false);
        if (parsed.isReimbursable) {
            parsed.includeInBudget = payload.optBoolean("includeInBudget", false);
            parsed.includeInAnalysis = payload.optBoolean("includeInAnalysis", false);
        } else {
            parsed.includeInBudget = payload.optBoolean("includeInBudget", true);
            parsed.includeInAnalysis = payload.optBoolean("includeInAnalysis", true);
        }
        return parsed;
    }

    public static WearTxUpdate validateTxUpdate(JSONObject payload) throws JSONException {
        String idempotencyKey = payload.optString("idempotencyKey", "").trim();
        String ledgerId = payload.optString("ledgerId", "").trim();
        String targetTxId = payload.optString("targetTxId", "").trim();
        String type = payload.optString("type", "").trim();
        String accountId = payload.optString("accountId", "").trim();
        String categoryId = payload.optString("categoryId", "").trim();
        long amountMinor = payload.optLong("amountMinor", 0L);

        if (idempotencyKey.isEmpty()) {
            throw new JSONException("rejected: idempotencyKey required");
        }
        if (ledgerId.isEmpty()) {
            throw new JSONException("rejected: ledgerId required");
        }
        if (!payload.has("catalogRevision")) {
            throw new JSONException("rejected: catalogRevision");
        }
        if (targetTxId.isEmpty()) {
            throw new JSONException("rejected: targetTxId required");
        }
        if (type.isEmpty()) {
            type = WearCompanionConstants.TYPE_EXPENSE;
        }
        if (!WearCompanionConstants.isEditableTxType(type)) {
            throw new JSONException("rejected: type not editable on watch");
        }
        if (accountId.isEmpty()) {
            throw new JSONException("rejected: accountId required");
        }
        if (WearCompanionConstants.TYPE_ADJUSTMENT.equals(type)) {
            if (amountMinor == 0L) {
                throw new JSONException("rejected: adjustment amountMinor");
            }
        } else if (amountMinor <= 0L) {
            throw new JSONException("rejected: amountMinor");
        }
        if (!WearCompanionConstants.TYPE_ADJUSTMENT.equals(type) && categoryId.isEmpty()) {
            throw new JSONException("rejected: categoryId required");
        }

        WearTxUpdate parsed = new WearTxUpdate();
        parsed.op = WearCompanionConstants.OP_UPDATE;
        parsed.idempotencyKey = idempotencyKey;
        parsed.clientTxId = payload.optString("clientTxId", "").trim();
        parsed.ledgerId = ledgerId;
        parsed.targetTxId = targetTxId;
        parsed.type = type;
        parsed.accountId = accountId;
        parsed.categoryId = categoryId;
        parsed.amountMinor = amountMinor;
        parsed.catalogRevision = payload.optLong("catalogRevision");
        parsed.occurredAt = payload.optString("occurredAt", "").trim();
        parsed.note = clampNote(payload.optString("note", ""));
        parsed.tags = normalizeTags(payload);
        parsed.isReimbursable = WearCompanionConstants.TYPE_EXPENSE.equals(type)
            && payload.optBoolean("isReimbursable", false);
        if (parsed.isReimbursable) {
            parsed.includeInBudget = payload.optBoolean("includeInBudget", false);
            parsed.includeInAnalysis = payload.optBoolean("includeInAnalysis", false);
        } else {
            parsed.includeInBudget = payload.optBoolean("includeInBudget", true);
            parsed.includeInAnalysis = payload.optBoolean("includeInAnalysis", true);
        }
        return parsed;
    }

    public static WearTxDelete validateTxDelete(JSONObject payload) throws JSONException {
        String idempotencyKey = payload.optString("idempotencyKey", "").trim();
        String ledgerId = payload.optString("ledgerId", "").trim();
        String targetTxId = payload.optString("targetTxId", "").trim();
        if (idempotencyKey.isEmpty()) {
            throw new JSONException("rejected: idempotencyKey required");
        }
        if (ledgerId.isEmpty()) {
            throw new JSONException("rejected: ledgerId required");
        }
        if (targetTxId.isEmpty()) {
            throw new JSONException("rejected: targetTxId required");
        }
        WearTxDelete parsed = new WearTxDelete();
        parsed.op = WearCompanionConstants.OP_DELETE;
        parsed.idempotencyKey = idempotencyKey;
        parsed.clientTxId = payload.optString("clientTxId", "").trim();
        parsed.ledgerId = ledgerId;
        parsed.targetTxId = targetTxId;
        return parsed;
    }

    public static String validateLedgerSet(JSONObject payload) throws JSONException {
        String ledgerId = payload.optString("ledgerId", "").trim();
        if (ledgerId.isEmpty()) {
            throw new JSONException("rejected: ledgerId required");
        }
        return ledgerId;
    }

    public static JSONObject ack(String status, String idempotencyKey, String txId, String error) throws JSONException {
        return ack(status, idempotencyKey, txId, error, null);
    }

    public static JSONObject ack(
        String status,
        String idempotencyKey,
        String txId,
        String error,
        String op
    ) throws JSONException {
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
        if (op != null) {
            ack.put("op", op);
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

    /** JSON array text for transactions.tags_json, or null when no tags were sent. */
    public static String tagsJson(List<String> tags) {
        if (tags == null || tags.isEmpty()) {
            return null;
        }
        return new JSONArray(tags).toString();
    }

    private static String clampNote(String note) {
        String value = note == null ? "" : note;
        if (value.length() > MAX_NOTE_LENGTH) {
            return value.substring(0, MAX_NOTE_LENGTH);
        }
        return value;
    }

    private static List<String> normalizeTags(JSONObject payload) {
        JSONArray raw = payload.optJSONArray("tags");
        if (raw == null) {
            String tagsJson = payload.optString("tagsJson", "").trim();
            if (!tagsJson.isEmpty()) {
                try {
                    raw = new JSONArray(tagsJson);
                } catch (JSONException ignored) {
                    raw = null;
                }
            }
        }
        LinkedHashSet<String> unique = new LinkedHashSet<>();
        if (raw != null) {
            for (int i = 0; i < raw.length() && unique.size() < MAX_TAGS; i += 1) {
                String tag = String.valueOf(raw.optString(i, "")).trim();
                if (tag.isEmpty()) {
                    continue;
                }
                if (tag.length() > MAX_TAG_LENGTH) {
                    tag = tag.substring(0, MAX_TAG_LENGTH);
                }
                unique.add(tag);
            }
        }
        return new ArrayList<>(unique);
    }

    public static final class WearTxCreate {
        public String op;
        public String idempotencyKey;
        public String clientTxId;
        public String ledgerId;
        public String type;
        public String accountId;
        public String categoryId;
        public String peerAccountId;
        public String sourceAccountId;
        public long amountMinor;
        public long catalogRevision;
        public String occurredAt;
        public String note;
        public List<String> tags;
        public String loanDirection;
        public String counterpartyName;
        public boolean isReimbursable = false;
        public boolean includeInBudget = true;
        public boolean includeInAnalysis = true;
    }

    public static final class WearTxUpdate {
        public String op;
        public String idempotencyKey;
        public String clientTxId;
        public String ledgerId;
        public String targetTxId;
        public String type;
        public String accountId;
        public String categoryId;
        public long amountMinor;
        public long catalogRevision;
        public String occurredAt;
        public String note;
        public List<String> tags;
        public boolean isReimbursable = false;
        public boolean includeInBudget = true;
        public boolean includeInAnalysis = true;
    }

    public static final class WearTxDelete {
        public String op;
        public String idempotencyKey;
        public String clientTxId;
        public String ledgerId;
        public String targetTxId;
    }
}
