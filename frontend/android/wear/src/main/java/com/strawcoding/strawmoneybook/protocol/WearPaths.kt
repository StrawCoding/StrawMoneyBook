package com.strawcoding.strawmoneybook.protocol

object WearPaths {
    const val PROTOCOL_VERSION = 1
    const val PREFIX = "/smb/v1/"
    const val HELLO = "/smb/v1/hello"
    const val TX_CREATE = "/smb/v1/tx/create"
    const val TX_UPDATE = "/smb/v1/tx/update"
    const val TX_DELETE = "/smb/v1/tx/delete"
    const val TX_ACK = "/smb/v1/tx/ack"
    const val LEDGER_SET = "/smb/v1/ledger/set"
    const val SNAPSHOT_REQUEST = "/smb/v1/snapshot/request"
    const val SNAPSHOT_PAYLOAD = "/smb/v1/snapshot/payload"
    const val CAPABILITY_PHONE = "smb_phone"
    const val CAPABILITY_WATCH = "smb_watch"

    val ALL = setOf(
        HELLO,
        TX_CREATE,
        TX_UPDATE,
        TX_DELETE,
        TX_ACK,
        LEDGER_SET,
        SNAPSHOT_REQUEST,
        SNAPSHOT_PAYLOAD,
    )

    fun isAllowed(path: String?): Boolean = path != null && ALL.contains(path)

    fun externalRefId(idempotencyKey: String): String = "wear:" + idempotencyKey.trim()
}

object WearTxTypes {
    const val EXPENSE = "expense"
    const val INCOME = "income"
    const val TRANSFER = "transfer"
    const val ADJUSTMENT = "adjustment"
    const val CREDIT_SPEND = "credit_spend"
    const val CREDIT_REPAY = "credit_repay"
    const val CREDIT_REFUND = "credit_refund"
    const val LOAN = "loan"

    val ALL = listOf(
        EXPENSE,
        INCOME,
        TRANSFER,
        ADJUSTMENT,
        CREDIT_SPEND,
        CREDIT_REPAY,
        CREDIT_REFUND,
        LOAN,
    )

    /** Types the watch may edit in place; everything else is phone-only. */
    val EDITABLE = setOf(EXPENSE, INCOME, ADJUSTMENT)

    fun isKnown(type: String?): Boolean = type != null && ALL.contains(type)

    fun requiresCategory(type: String?): Boolean =
        type == EXPENSE || type == INCOME || type == CREDIT_SPEND

    fun requiresPeerAccount(type: String?): Boolean = type == TRANSFER || type == CREDIT_REPAY
}

object WearTxOps {
    const val CREATE = "create"
    const val UPDATE = "update"
    const val DELETE = "delete"

    val ALL = listOf(CREATE, UPDATE, DELETE)

    fun isKnown(op: String?): Boolean = op != null && ALL.contains(op)

    fun pathFor(op: String?): String = when (op) {
        UPDATE -> WearPaths.TX_UPDATE
        DELETE -> WearPaths.TX_DELETE
        else -> WearPaths.TX_CREATE
    }
}

object WearNearbyPolicy {
    @JvmStatic
    fun maySend(isNearby: Boolean): Boolean = isNearby
}
