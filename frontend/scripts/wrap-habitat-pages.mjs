#!/usr/bin/env node
/**
 * One-off batch wrap: stack + page-head → HabitatPageShell.
 * Skips files that already import HabitatPageShell.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const views = resolve(root, 'src/ui/views')

/** @type {Array<{rel:string, titleKey:string, kickerKey:string, backTo?:string, testId:string, stackClass?:string}>} */
const PAGES = [
  { rel: 'reimbursements/ReimbursementListPage.vue', titleKey: 'reimbursement.list_title', kickerKey: 'reimbursement.habitat_hello', backTo: '/features', testId: 'reimbursement-list-view' },
  { rel: 'reimbursements/ReimbursementAdvanceManagementPage.vue', titleKey: 'reimbursement.advance_manage_title', kickerKey: 'reimbursement.habitat_hello', backTo: '/reimbursements', testId: 'reimbursement-advance-view' },
  { rel: 'reimbursements/ReimbursementAdvanceUsageManagementPage.vue', titleKey: 'reimbursement.offset_records', kickerKey: 'reimbursement.habitat_hello', backTo: '/reimbursements', testId: 'reimbursement-offset-view' },
  { rel: 'reimbursements/ReimbursementEditPage.vue', titleKey: 'reimbursement.edit_title', kickerKey: 'reimbursement.habitat_hello', backTo: '/reimbursements', testId: 'reimbursement-edit-view' },
  { rel: 'reimbursements/ReimbursementOffsetAboutPage.vue', titleKey: 'reimbursement.offset_about_title', kickerKey: 'reimbursement.habitat_hello', backTo: '/reimbursements', testId: 'reimbursement-offset-about-view' },
  { rel: 'claims/ClaimSheetListPage.vue', titleKey: 'claim_sheet.list_title', kickerKey: 'claim_sheet.habitat_hello', backTo: '/features', testId: 'claim-sheet-list-view' },
  { rel: 'claims/ClaimSheetDetailPage.vue', titleKey: 'claim_sheet.detail_title', kickerKey: 'claim_sheet.habitat_hello', backTo: '/claim-sheets', testId: 'claim-sheet-detail-view' },
  { rel: 'claims/ClaimSheetEditPage.vue', titleKey: 'claim_sheet.edit_title', kickerKey: 'claim_sheet.habitat_hello', backTo: '/claim-sheets', testId: 'claim-sheet-edit-view' },
  { rel: 'claims/ClaimSheetImportPage.vue', titleKey: 'claim_sheet.import_reimbursements_title', kickerKey: 'claim_sheet.habitat_hello', testId: 'claim-sheet-import-view' },
  { rel: 'claims/ClaimSheetImportBorrowLoanPage.vue', titleKey: 'claim_sheet.import_borrow_title', kickerKey: 'claim_sheet.habitat_hello', testId: 'claim-sheet-import-borrow-view' },
  { rel: 'savings-jars/SavingsJarListPage.vue', titleKey: 'savings_jar.list_title', kickerKey: 'savings_jar.habitat_hello', backTo: '/features', testId: 'savings-jar-list-view' },
  { rel: 'subscriptions/SubscriptionListPage.vue', titleKey: 'subscription.list_title', kickerKey: 'subscription.habitat_hello', backTo: '/features', testId: 'subscription-list-view' },
  { rel: 'credit-cards/CreditCardsPage.vue', titleKey: 'credit_cards_page.title', kickerKey: 'credit_cards_page.habitat_hello', backTo: '/features', testId: 'credit-cards-view' },
  { rel: 'securities/SecuritiesListPage.vue', titleKey: 'securities_page.title', kickerKey: 'securities_page.habitat_hello', backTo: '/features', testId: 'securities-list-view' },
  { rel: 'securities/SecurityDetailPage.vue', titleKey: 'securities_page.detail_page_title', kickerKey: 'securities_page.habitat_hello', backTo: '/assets/securities', testId: 'security-detail-view' },
  { rel: 'budgeting.vue', titleKey: 'budgeting.settings_title', kickerKey: 'budget_settings.habitat_hello', backTo: '/budget', testId: 'budget-settings-view' },
  { rel: 'AnalysisCategoryDetailPage.vue', titleKey: 'analysis_category_detail.title', kickerKey: 'analysis_page.habitat_hello', backTo: '/analysis', testId: 'analysis-category-view' },
  { rel: 'loans/LoanDetailPage.vue', titleKey: 'loans.detail_title', kickerKey: 'loans.habitat_hello', backTo: '/loans', testId: 'loan-detail-view' },
  { rel: 'loans/LoanCounterpartyDetailPage.vue', titleKey: 'loans.counterparty_title', kickerKey: 'loans.habitat_hello', backTo: '/loans', testId: 'loan-counterparty-view' },
  { rel: 'accounts/AssetAccountManagementPage.vue', titleKey: 'assets_page.manage', kickerKey: 'assets_page.habitat_hello', backTo: '/assets', testId: 'asset-account-manage-view' },
  { rel: 'accounts/AccountDetailPage.vue', titleKey: 'account.detail_title', kickerKey: 'assets_page.habitat_hello', backTo: '/assets', testId: 'account-detail-view' },
  { rel: 'accounts/AssetAccountGroupDetailPage.vue', titleKey: 'account_group.detail_title', kickerKey: 'assets_page.habitat_hello', backTo: '/assets/accounts', testId: 'account-group-view' },
  { rel: 'TransactionAboutPage.vue', titleKey: 'transaction_about.title', kickerKey: 'transaction_search.habitat_hello', backTo: '/', testId: 'transaction-about-view' },
  { rel: 'IconPickerPage.vue', titleKey: 'icon_picker.title', kickerKey: 'icon_picker.habitat_hello', testId: 'icon-picker-view' },
  { rel: 'settings/SettingsAccountPage.vue', titleKey: 'settings_account.title', kickerKey: 'settings_account.habitat_hello', backTo: '/settings', testId: 'settings-account-view', stackClass: 'settings-subpage' },
  { rel: 'settings/SettingsDataManagementPage.vue', titleKey: 'settings_data.title', kickerKey: 'settings_data.habitat_hello', backTo: '/settings', testId: 'settings-data-view', stackClass: 'settings-subpage' },
  { rel: 'settings/SettingsPersonalizationPage.vue', titleKey: 'personalization.title', kickerKey: 'settings_page.habitat_hello', backTo: '/settings', testId: 'settings-personalization-view', stackClass: 'settings-subpage' },
  { rel: 'settings/SettingsLanguagePage.vue', titleKey: 'settings_language.title', kickerKey: 'settings_language.habitat_hello', backTo: '/settings', testId: 'settings-language-view', stackClass: 'settings-subpage' },
  { rel: 'settings/SettingsSecurityPage.vue', titleKey: 'settings_security.title', kickerKey: 'settings_security.habitat_hello', backTo: '/settings', testId: 'settings-security-view', stackClass: 'settings-subpage' },
  { rel: 'settings/SettingsAutoBackupPage.vue', titleKey: 'settings_auto_backup.title', kickerKey: 'settings_auto_backup.habitat_hello', backTo: '/settings', testId: 'settings-auto-backup-view', stackClass: 'settings-subpage' },
  { rel: 'settings/SettingsGoogleDriveLedgerSyncPage.vue', titleKey: 'settings_google_drive_sync.title', kickerKey: 'settings_google_drive_sync.habitat_hello', backTo: '/settings', testId: 'settings-gdrive-sync-view', stackClass: 'settings-subpage' },
  { rel: 'settings/SettingsSharedLedgerPage.vue', titleKey: 'settings_shared_ledger.title', kickerKey: 'settings_shared_ledger.habitat_hello', backTo: '/settings', testId: 'settings-shared-ledger-view', stackClass: 'settings-subpage' },
  { rel: 'settings/SettingsExchangeRatePage.vue', titleKey: 'settings_exchange_rate.title', kickerKey: 'settings_exchange_rate.habitat_hello', backTo: '/settings', testId: 'settings-exchange-view', stackClass: 'settings-subpage' },
  { rel: 'settings/SettingsBookkeepingReminderPage.vue', titleKey: 'settings_bookkeeping_reminder.title', kickerKey: 'settings_bookkeeping_reminder.habitat_hello', backTo: '/settings', testId: 'settings-reminder-view', stackClass: 'settings-subpage' },
  { rel: 'settings/SettingsCategoryPage.vue', titleKey: 'settings_category.title', kickerKey: 'settings_category.habitat_hello', backTo: '/settings', testId: 'settings-category-view', stackClass: 'settings-subpage' },
  { rel: 'settings/SettingsCategoryDetailPage.vue', titleKey: 'settings_category.detail_title', kickerKey: 'settings_category.habitat_hello', backTo: '/settings/categories', testId: 'settings-category-detail-view', stackClass: 'settings-subpage' },
  { rel: 'settings/SettingsCategoryGroupDetailPage.vue', titleKey: 'settings_category.group_detail_title', kickerKey: 'settings_category.habitat_hello', backTo: '/settings/categories', testId: 'settings-category-group-view', stackClass: 'settings-subpage' },
  { rel: 'settings/SettingsLedgerPage.vue', titleKey: 'settings_ledger.title', kickerKey: 'settings_ledger.habitat_hello', backTo: '/settings', testId: 'settings-ledger-view', stackClass: 'settings-subpage' },
  { rel: 'settings/SettingsLedgerDetailPage.vue', titleKey: 'settings_ledger.detail_title', kickerKey: 'settings_ledger.habitat_hello', backTo: '/settings/ledgers', testId: 'settings-ledger-detail-view', stackClass: 'settings-subpage' },
  { rel: 'settings/SettingsAddonTemplatePage.vue', titleKey: 'settings_addon_template.title', kickerKey: 'settings_addon_template.habitat_hello', backTo: '/settings', testId: 'settings-addon-view', stackClass: 'settings-subpage' },
  { rel: 'settings/SettingsAutoFillRulesPage.vue', titleKey: 'settings_auto_fill.title', kickerKey: 'settings_auto_fill.habitat_hello', backTo: '/settings', testId: 'settings-autofill-view', stackClass: 'settings-subpage' },
  { rel: 'settings/SettingsAutoFillRuleEditPage.vue', titleKey: 'settings_auto_fill.edit_title', kickerKey: 'settings_auto_fill.habitat_hello', backTo: '/settings/auto-fill-rules', testId: 'settings-autofill-edit-view', stackClass: 'settings-subpage' },
  { rel: 'settings/SettingsBankSyncPage.vue', titleKey: 'settings_bank_sync.title', kickerKey: 'settings_bank_sync.habitat_hello', backTo: '/settings', testId: 'settings-bank-sync-view', stackClass: 'settings-subpage' },
  { rel: 'settings/SettingsBankSyncCreatePage.vue', titleKey: 'settings_bank_sync_create.title', kickerKey: 'settings_bank_sync.habitat_hello', backTo: '/settings/bank-sync', testId: 'settings-bank-create-view', stackClass: 'settings-subpage' },
  { rel: 'settings/SettingsBankSyncConnectionPage.vue', titleKey: 'settings_bank_sync_connection.title', kickerKey: 'settings_bank_sync.habitat_hello', backTo: '/settings/bank-sync', testId: 'settings-bank-connection-view', stackClass: 'settings-subpage' },
  { rel: 'settings/SettingsCarrierSyncPage.vue', titleKey: 'settings_carrier_sync.title', kickerKey: 'settings_carrier_sync.habitat_hello', backTo: '/settings', testId: 'settings-carrier-view', stackClass: 'settings-subpage' },
  { rel: 'settings/SettingsMembershipBenefitsPage.vue', titleKey: 'settings_membership.title', kickerKey: 'settings_membership.habitat_hello', backTo: '/settings', testId: 'settings-membership-view', stackClass: 'settings-subpage' },
  { rel: 'settings/SettingsWearCompanionPage.vue', titleKey: 'settings_wear_companion.title', kickerKey: 'settings_wear_companion.habitat_hello', backTo: '/settings', testId: 'settings-wear-view', stackClass: 'settings-subpage' },
  { rel: 'settings/SettingsAboutPage.vue', titleKey: 'settings_about.title', kickerKey: 'settings_about.habitat_hello', backTo: '/settings', testId: 'settings-about-view', stackClass: 'settings-subpage' },
  { rel: 'settings/SettingsVersionInfoPage.vue', titleKey: 'settings_version.title', kickerKey: 'settings_version.habitat_hello', backTo: '/settings/about', testId: 'settings-version-view', stackClass: 'settings-subpage' },
  { rel: 'settings/SettingsAdminPage.vue', titleKey: 'settings_admin.title', kickerKey: 'settings_admin.habitat_hello', backTo: '/settings', testId: 'settings-admin-view', stackClass: 'settings-subpage' },
  { rel: 'settings/SettingsAdminMemberPage.vue', titleKey: 'settings_admin.member_title', kickerKey: 'settings_admin.habitat_hello', backTo: '/settings/admin', testId: 'settings-admin-member-view', stackClass: 'settings-subpage' },
  { rel: 'settings/SettingsDeveloperDebugPage.vue', titleKey: 'settings_developer.title', kickerKey: 'settings_developer.habitat_hello', backTo: '/settings', testId: 'settings-dev-view', stackClass: 'settings-subpage' },
]

const HEADER_RE = /\n\s*<header class="row[^"]*">[\s\S]*?<\/header>\n/

function shellOpen(p) {
  const back = p.backTo ? `\n    back-to="${p.backTo}"` : ''
  const stack = p.stackClass ? `\n    stack-class="${p.stackClass}"` : ''
  return `<HabitatPageShell
    :title="t('${p.titleKey}')"
    :kicker="t('${p.kickerKey}')"
    test-id="${p.testId}"${back}${stack}
  >`
}

function wrapFile(p) {
  const path = resolve(views, p.rel)
  let s = readFileSync(path, 'utf8')
  if (s.includes('HabitatPageShell')) {
    console.log('skip (already)', p.rel)
    return
  }
  if (!HEADER_RE.test(s)) {
    console.warn('no page-head header', p.rel)
    return
  }
  s = s.replace(HEADER_RE, '\n')

  if (s.match(/<div class="view-root">\s*\n\s*<section class="stack"/)) {
    s = s.replace(
      /<div class="view-root">\s*\n\s*<section class="stack([^"]*)">/,
      `${shellOpen(p)}\n`,
    )
    s = s.replace(/\n\s*<\/section>\s*\n\s*<\/div>\s*\n<\/template>/, '\n  </HabitatPageShell>\n</template>')
  } else if (s.match(/<section class="stack/)) {
    s = s.replace(/<section class="stack([^"]*)">/, `${shellOpen(p)}`)
    s = s.replace(/\n\s*<\/section>\s*\n<\/template>/, '\n  </HabitatPageShell>\n</template>')
  } else {
    console.warn('unknown template root', p.rel)
    return
  }

  if (!s.includes("import HabitatPageShell")) {
    s = s.replace(
      /<script setup>\n/,
      `<script setup>\nimport HabitatPageShell from '@/ui/components/layout/HabitatPageShell.vue'\n`,
    )
  }

  // tab-row → segment-pills (non-destructive class add)
  s = s.replace(/class="tab-row"/g, 'class="segment-pills tab-row"')
  s = s.replace(/<div class="tab-row">/g, '<div class="segment-pills tab-row">')

  writeFileSync(path, s)
  console.log('wrapped', p.rel)
}

for (const p of PAGES) wrapFile(p)
