import { initDatabase } from '@/core/db/sqlite'
import { createLocalDatabaseIntegrityError } from '@/core/services/data-wipe-guard.service'
import { APP_DOWNGRADE_BLOCKED_CODE } from '@/core/services/data-downgrade-guard.service'
import { isForeignKeyError } from '@/core/utils/sqlite-fk'

/**
 * smb297: bootstrap must NEVER call resetDatabase / rebuild.
 * Schema / FK / migration failures surface as typed integrity errors so the
 * user can restore from Google Drive / backup / import, or explicitly reset.
 */
export async function bootstrapCoreDatabase() {
  try {
    await initDatabase()
  } catch (error) {
    if (
      error?.code === 'LOCAL_DB_INTEGRITY'
      || error?.code === APP_DOWNGRADE_BLOCKED_CODE
      || error?.silentWipeBlocked
    ) {
      throw error
    }
    if (isForeignKeyError(error)) {
      throw createLocalDatabaseIntegrityError(error, {
        message:
          '本機資料庫外鍵／關聯檢查失敗。系統不會自動清空帳本；請先修復、從備份還原，或至資料管理明確重設。',
        i18nKey: 'app.local_db_integrity',
      })
    }
    throw createLocalDatabaseIntegrityError(error)
  }
}
