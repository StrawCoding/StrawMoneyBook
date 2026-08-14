package com.strawcoding.strawmoneybook.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(entities = [OutboxEntity::class], version = 1, exportSchema = false)
abstract class WearOutboxDatabase : RoomDatabase() {
    abstract fun outboxDao(): OutboxDao

    companion object {
        @Volatile private var instance: WearOutboxDatabase? = null

        fun get(context: Context): WearOutboxDatabase {
            return instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    WearOutboxDatabase::class.java,
                    "smb_wear_outbox.db",
                ).build().also { instance = it }
            }
        }
    }
}
