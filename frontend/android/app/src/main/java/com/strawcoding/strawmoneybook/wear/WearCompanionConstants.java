package com.strawcoding.strawmoneybook.wear;

public final class WearCompanionConstants {
    public static final int PROTOCOL_VERSION = 1;
    public static final String PATH_PREFIX = "/smb/v1/";
    public static final String PATH_HELLO = "/smb/v1/hello";
    public static final String PATH_TX_CREATE = "/smb/v1/tx/create";
    public static final String PATH_TX_UPDATE = "/smb/v1/tx/update";
    public static final String PATH_TX_DELETE = "/smb/v1/tx/delete";
    public static final String PATH_TX_ACK = "/smb/v1/tx/ack";
    public static final String PATH_LEDGER_SET = "/smb/v1/ledger/set";
    public static final String PATH_SNAPSHOT_REQUEST = "/smb/v1/snapshot/request";
    public static final String PATH_SNAPSHOT_PAYLOAD = "/smb/v1/snapshot/payload";

    public static final String TYPE_EXPENSE = "expense";
    public static final String TYPE_INCOME = "income";
    public static final String TYPE_TRANSFER = "transfer";
    public static final String TYPE_ADJUSTMENT = "adjustment";
    public static final String TYPE_CREDIT_SPEND = "credit_spend";
    public static final String TYPE_CREDIT_REPAY = "credit_repay";
    public static final String TYPE_CREDIT_REFUND = "credit_refund";
    public static final String TYPE_LOAN = "loan";

    public static final String OP_CREATE = "create";
    public static final String OP_UPDATE = "update";
    public static final String OP_DELETE = "delete";

    public static final String LOGICAL_DB_NAME = "straw_money_book";
    public static final String SQLITE_FILE_NAME = "straw_money_bookSQLite.db";
    public static final String ENCRYPTION_MODE = "no-encryption";
    public static final int CAPACITOR_DB_VERSION = 1;
    public static final int REQUIRED_SCHEMA_VERSION = 45;

    public static final String[] MESSAGE_PATHS = new String[] {
        PATH_HELLO,
        PATH_TX_CREATE,
        PATH_TX_UPDATE,
        PATH_TX_DELETE,
        PATH_TX_ACK,
        PATH_LEDGER_SET,
        PATH_SNAPSHOT_REQUEST,
        PATH_SNAPSHOT_PAYLOAD,
    };

    public static final String[] TX_TYPES = new String[] {
        TYPE_EXPENSE,
        TYPE_INCOME,
        TYPE_TRANSFER,
        TYPE_ADJUSTMENT,
        TYPE_CREDIT_SPEND,
        TYPE_CREDIT_REPAY,
        TYPE_CREDIT_REFUND,
        TYPE_LOAN,
    };

    private WearCompanionConstants() {}

    public static boolean isAllowedPath(String path) {
        if (path == null) {
            return false;
        }
        for (String allowed : MESSAGE_PATHS) {
            if (allowed.equals(path)) {
                return true;
            }
        }
        return false;
    }

    public static boolean isKnownTxType(String type) {
        if (type == null) {
            return false;
        }
        for (String known : TX_TYPES) {
            if (known.equals(type)) {
                return true;
            }
        }
        return false;
    }

    /** Types the watch may edit in place; the rest stay phone-only. */
    public static boolean isEditableTxType(String type) {
        return TYPE_EXPENSE.equals(type) || TYPE_INCOME.equals(type) || TYPE_ADJUSTMENT.equals(type);
    }

    public static boolean requiresCategory(String type) {
        return TYPE_EXPENSE.equals(type) || TYPE_INCOME.equals(type) || TYPE_CREDIT_SPEND.equals(type);
    }

    public static boolean requiresPeerAccount(String type) {
        return TYPE_TRANSFER.equals(type) || TYPE_CREDIT_REPAY.equals(type);
    }

    public static String externalRefId(String idempotencyKey) {
        return "wear:" + String.valueOf(idempotencyKey).trim();
    }
}
