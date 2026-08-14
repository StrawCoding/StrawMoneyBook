package com.strawcoding.strawmoneybook.protocol

object WearPaths {
    const val PROTOCOL_VERSION = 1
    const val PREFIX = "/smb/v1/"
    const val HELLO = "/smb/v1/hello"
    const val TX_CREATE = "/smb/v1/tx/create"
    const val TX_ACK = "/smb/v1/tx/ack"
    const val SNAPSHOT_REQUEST = "/smb/v1/snapshot/request"
    const val SNAPSHOT_PAYLOAD = "/smb/v1/snapshot/payload"
    const val CAPABILITY_PHONE = "smb_phone"
    const val CAPABILITY_WATCH = "smb_watch"

    val ALL = setOf(HELLO, TX_CREATE, TX_ACK, SNAPSHOT_REQUEST, SNAPSHOT_PAYLOAD)

    fun isAllowed(path: String?): Boolean = path != null && ALL.contains(path)

    fun externalRefId(idempotencyKey: String): String = "wear:" + idempotencyKey.trim()
}

object WearNearbyPolicy {
    @JvmStatic
    fun maySend(isNearby: Boolean): Boolean = isNearby
}
