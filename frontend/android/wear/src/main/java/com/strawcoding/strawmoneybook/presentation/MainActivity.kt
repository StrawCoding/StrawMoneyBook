package com.strawcoding.strawmoneybook.presentation

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.TimeText
import androidx.wear.compose.navigation.SwipeDismissableNavHost
import androidx.wear.compose.navigation.composable
import androidx.wear.compose.navigation.rememberSwipeDismissableNavController
import com.strawcoding.strawmoneybook.WearApp
import com.strawcoding.strawmoneybook.protocol.WearTxTypes
import com.strawcoding.strawmoneybook.sync.WearSyncRepository
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val repo = (application as WearApp).syncRepository
        setContent {
            MaterialTheme {
                WearRoot(repo)
            }
        }
    }
}

object WearRoutes {
    const val HOME = "home"
    const val TYPES = "types"
    const val ADD = "add"
    const val PICKER = "picker"
    const val TAGS = "tags"
    const val TIME = "time"
    const val NOTE = "note"
    const val RECENT = "recent"
    const val DETAIL = "detail"
    const val LEDGERS = "ledgers"
    const val TEMPLATES = "templates"
}

@Composable
private fun WearRoot(repo: WearSyncRepository) {
    val nav = rememberSwipeDismissableNavController()
    val scope = rememberCoroutineScope()
    val draft = remember { WearDraftState() }
    var toast by remember { mutableStateOf("") }
    var refreshTick by remember { mutableStateOf(0) }
    var detailTxId by remember { mutableStateOf("") }

    val sync: () -> Unit = {
        scope.launch {
            runCatching {
                repo.requestHelloAndSnapshot()
                repo.flushPending()
            }
            refreshTick += 1
        }
    }

    LaunchedEffect(Unit) {
        runCatching {
            repo.requestHelloAndSnapshot()
            repo.flushPending()
        }
        refreshTick += 1
    }

    val submit: () -> Unit = {
        val error = draft.validationError()
        if (error != null) {
            toast = error
        } else {
            scope.launch {
                val result = runCatching {
                    if (draft.isEditing) {
                        repo.enqueueUpdate(
                            targetTxId = draft.editingTxId,
                            type = draft.type,
                            amountMinor = draft.amountMinor,
                            accountId = draft.accountId,
                            categoryId = draft.categoryId.ifBlank { null },
                            note = draft.note.ifBlank { null },
                            tags = draft.tags.toList(),
                            occurredAt = isoUtc(draft.occurredAtMillis),
                        )
                    } else {
                        repo.enqueueEntry(draft.toEntryDraft())
                    }
                }
                toast = if (result.isSuccess) {
                    if (draft.isEditing) "已排入修改" else "已記一筆"
                } else {
                    enqueueErrorLabel(result.exceptionOrNull()?.message)
                }
                if (result.isSuccess) {
                    draft.reset(WearTxTypes.EXPENSE)
                    refreshTick += 1
                    nav.popBackStack(WearRoutes.HOME, false)
                }
            }
        }
    }

    Scaffold(timeText = { TimeText() }) {
        SwipeDismissableNavHost(navController = nav, startDestination = WearRoutes.HOME) {
            composable(WearRoutes.HOME) {
                HomeScreen(
                    repo = repo,
                    refreshTick = refreshTick,
                    toast = toast,
                    onQuickAdd = {
                        draft.reset(WearTxTypes.EXPENSE)
                        toast = ""
                        nav.navigate(WearRoutes.ADD)
                    },
                    onPickType = {
                        toast = ""
                        nav.navigate(WearRoutes.TYPES)
                    },
                    onRecent = { nav.navigate(WearRoutes.RECENT) },
                    onLedgers = { nav.navigate(WearRoutes.LEDGERS) },
                    onTemplates = { nav.navigate(WearRoutes.TEMPLATES) },
                    onRepeatLast = {
                        scope.launch {
                            val result = runCatching { repo.repeatLast() }
                            toast = when {
                                result.isFailure -> enqueueErrorLabel(result.exceptionOrNull()?.message)
                                result.getOrNull() == null -> "尚無可重複的紀錄"
                                else -> "已重複上一筆"
                            }
                            refreshTick += 1
                        }
                    },
                    onRefresh = sync,
                )
            }
            composable(WearRoutes.TYPES) {
                TypePickerScreen(
                    current = draft.type,
                    onPick = { type ->
                        draft.reset(type)
                        nav.navigate(WearRoutes.ADD)
                    },
                )
            }
            composable(WearRoutes.ADD) {
                EntryScreen(
                    repo = repo,
                    draft = draft,
                    toast = toast,
                    onOpenPicker = { target ->
                        draft.pickerTarget = target
                        nav.navigate(WearRoutes.PICKER)
                    },
                    onOpenTags = { nav.navigate(WearRoutes.TAGS) },
                    onOpenTime = { nav.navigate(WearRoutes.TIME) },
                    onOpenNote = { nav.navigate(WearRoutes.NOTE) },
                    onSubmit = submit,
                )
            }
            composable(WearRoutes.PICKER) {
                PickerScreen(
                    repo = repo,
                    draft = draft,
                    onDone = { nav.popBackStack() },
                )
            }
            composable(WearRoutes.TAGS) {
                TagsScreen(repo = repo, draft = draft, onDone = { nav.popBackStack() })
            }
            composable(WearRoutes.TIME) {
                TimeScreen(draft = draft, onDone = { nav.popBackStack() })
            }
            composable(WearRoutes.NOTE) {
                NoteScreen(draft = draft, onDone = { nav.popBackStack() })
            }
            composable(WearRoutes.RECENT) {
                RecentScreen(
                    repo = repo,
                    refreshTick = refreshTick,
                    onOpenTx = { txId ->
                        detailTxId = txId
                        nav.navigate(WearRoutes.DETAIL)
                    },
                )
            }
            composable(WearRoutes.DETAIL) {
                TransactionDetailScreen(
                    repo = repo,
                    txId = detailTxId,
                    onEdit = { tx ->
                        draft.loadFromRecent(tx)
                        toast = ""
                        nav.navigate(WearRoutes.ADD)
                    },
                    onDelete = { txId ->
                        scope.launch {
                            val result = runCatching { repo.enqueueDelete(txId) }
                            toast = if (result.isSuccess) "已排入刪除" else enqueueErrorLabel(result.exceptionOrNull()?.message)
                            refreshTick += 1
                            nav.popBackStack(WearRoutes.HOME, false)
                        }
                    },
                )
            }
            composable(WearRoutes.LEDGERS) {
                LedgerScreen(
                    repo = repo,
                    onPick = { ledgerId ->
                        scope.launch {
                            runCatching { repo.setActiveLedger(ledgerId) }
                            refreshTick += 1
                            nav.popBackStack()
                        }
                    },
                )
            }
            composable(WearRoutes.TEMPLATES) {
                TemplatesScreen(
                    repo = repo,
                    refreshTick = refreshTick,
                    onUse = { template ->
                        draft.reset(template.type)
                        draft.digits = (template.amountMinor / 100.0).let {
                            if (it % 1.0 == 0.0) it.toLong().toString() else it.toString()
                        }
                        draft.accountId = template.accountId
                        draft.categoryId = template.categoryId
                        nav.navigate(WearRoutes.ADD)
                    },
                    onSaveCurrent = {
                        toast = saveTemplateFromDraft(repo, draft)
                        nav.popBackStack()
                    },
                )
            }
        }
    }
}

private fun saveTemplateFromDraft(repo: WearSyncRepository, draft: WearDraftState): String {
    if (draft.amountMinor <= 0L || draft.accountId.isBlank()) {
        return "先填好一筆再存範本"
    }
    val cache = repo.cacheStore()
    val templates = cache.templates().toMutableList()
    templates.add(
        com.strawcoding.strawmoneybook.data.WearTemplate(
            id = "tpl_" + System.currentTimeMillis().toString(36),
            label = buildString {
                append(typeLabel(draft.type))
                if (draft.categoryName.isNotBlank()) append(" ").append(draft.categoryName)
                append(" ").append(formatTwd(draft.amountMinor))
            },
            type = draft.type,
            amountMinor = draft.amountMinor,
            accountId = draft.accountId,
            categoryId = draft.categoryId,
        )
    )
    cache.saveTemplates(templates)
    return "已存為範本"
}

private fun enqueueErrorLabel(message: String?): String = when (message) {
    "no_ledger" -> "請先與手機同步帳本"
    "catalog_required" -> "缺少預設帳戶／分類，請同步"
    "peer_required" -> "請選擇對方帳戶"
    "loan_direction_required" -> "請選擇借出或借入"
    "counterparty_required" -> "請填借貸對象"
    "type_not_editable" -> "此類型請在手機修改"
    else -> "排入失敗：" + (message ?: "未知錯誤")
}
