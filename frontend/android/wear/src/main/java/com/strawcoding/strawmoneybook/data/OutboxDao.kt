package com.strawcoding.strawmoneybook.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface OutboxDao {
    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(row: OutboxEntity)

    @Query("SELECT * FROM wear_outbox ORDER BY createdAt DESC LIMIT :limit")
    fun observeRecent(limit: Int = 8): Flow<List<OutboxEntity>>

    @Query("SELECT * FROM wear_outbox WHERE status IN ('pending','sent','ack_nack') ORDER BY createdAt ASC")
    suspend fun listFlushable(): List<OutboxEntity>

    @Query("SELECT * FROM wear_outbox WHERE idempotencyKey = :key LIMIT 1")
    suspend fun findByIdempotencyKey(key: String): OutboxEntity?

    @Query(
        "UPDATE wear_outbox SET status = :status, lastError = :error, phoneTxId = :phoneTxId, updatedAt = :updatedAt WHERE idempotencyKey = :key"
    )
    suspend fun updateStatus(
        key: String,
        status: String,
        error: String?,
        phoneTxId: String?,
        updatedAt: String,
    )

    @Query("SELECT COUNT(*) FROM wear_outbox WHERE status IN ('pending','sent','ack_nack')")
    fun observePendingCount(): Flow<Int>
}
