package com.strawcoding.strawmoneybook.data

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "wear_outbox",
    indices = [Index(value = ["idempotencyKey"], unique = true)]
)
data class OutboxEntity(
    @PrimaryKey val clientTxId: String,
    val idempotencyKey: String,
    val ledgerId: String,
    val type: String,
    val accountId: String,
    /** Empty for types that carry no category (transfer, credit repay). */
    val categoryId: String,
    val amountMinor: Long,
    val catalogRevision: Long,
    val occurredAt: String,
    val note: String?,
    val status: String,
    val lastError: String?,
    val phoneTxId: String?,
    val createdAt: String,
    val updatedAt: String,
    @ColumnInfo(defaultValue = OutboxOps.CREATE)
    val op: String = OutboxOps.CREATE,
    /** Transfer destination account, or the funding account for a credit repay. */
    val peerAccountId: String? = null,
    val sourceAccountId: String? = null,
    /** JSON array of tag strings, as sent in the tx payload. */
    val tagsJson: String? = null,
    /** JSON object for type-specific extras: loanDirection, counterpartyName, addons. */
    val extrasJson: String? = null,
    /** Phone transaction id targeted by an update or delete op. */
    val targetTxId: String? = null,
)

object OutboxStatus {
    const val PENDING = "pending"
    const val SENT = "sent"
    const val ACK_OK = "ack_ok"
    const val ACK_NACK = "ack_nack"
    const val FAILED = "failed"
}

object OutboxOps {
    const val CREATE = "create"
    const val UPDATE = "update"
    const val DELETE = "delete"
}
