package com.strawcoding.strawmoneybook.data

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
)

object OutboxStatus {
    const val PENDING = "pending"
    const val SENT = "sent"
    const val ACK_OK = "ack_ok"
    const val ACK_NACK = "ack_nack"
    const val FAILED = "failed"
}
