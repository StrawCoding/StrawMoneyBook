package com.strawcoding.strawmoneybook.wear;

public final class WearCompanionConstants {
    public static final int PROTOCOL_VERSION = 1;
    public static final String PATH_PREFIX = "/smb/v1/";
    public static final String PATH_HELLO = "/smb/v1/hello";
    public static final String PATH_TX_CREATE = "/smb/v1/tx/create";
    public static final String PATH_TX_ACK = "/smb/v1/tx/ack";
    public static final String PATH_SNAPSHOT_REQUEST = "/smb/v1/snapshot/request";
    public static final String PATH_SNAPSHOT_PAYLOAD = "/smb/v1/snapshot/payload";

    public static final String LOGICAL_DB_NAME = "straw_money_book";
    public static final String SQLITE_FILE_NAME = "straw_money_bookSQLite.db";
    public static final String ENCRYPTION_MODE = "no-encryption";
    public static final int CAPACITOR_DB_VERSION = 1;
    public static final int REQUIRED_SCHEMA_VERSION = 45;

    public static final String[] MESSAGE_PATHS = new String[] {
        PATH_HELLO,
        PATH_TX_CREATE,
        PATH_TX_ACK,
        PATH_SNAPSHOT_REQUEST,
        PATH_SNAPSHOT_PAYLOAD,
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

    public static String externalRefId(String idempotencyKey) {
        return "wear:" + String.valueOf(idempotencyKey).trim();
    }
}
