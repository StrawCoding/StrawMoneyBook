package com.strawcoding.strawmoneybook.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(entities = [OutboxEntity::class], version = 2, exportSchema = false)
abstract class WearOutboxDatabase : RoomDatabase() {
    abstract fun outboxDao(): OutboxDao

    companion object {
        @Volatile private var instance: WearOutboxDatabase? = null

        /** Additive so queued rows survive the scope B upgrade. */
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE wear_outbox ADD COLUMN op TEXT NOT NULL DEFAULT '${OutboxOps.CREATE}'")
                db.execSQL("ALTER TABLE wear_outbox ADD COLUMN peerAccountId TEXT")
                db.execSQL("ALTER TABLE wear_outbox ADD COLUMN sourceAccountId TEXT")
                db.execSQL("ALTER TABLE wear_outbox ADD COLUMN tagsJson TEXT")
                db.execSQL("ALTER TABLE wear_outbox ADD COLUMN extrasJson TEXT")
                db.execSQL("ALTER TABLE wear_outbox ADD COLUMN targetTxId TEXT")
            }
        }

        fun get(context: Context): WearOutboxDatabase {
            return instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    WearOutboxDatabase::class.java,
                    "smb_wear_outbox.db",
                ).addMigrations(MIGRATION_1_2).build().also { instance = it }
            }
        }
    }
}
