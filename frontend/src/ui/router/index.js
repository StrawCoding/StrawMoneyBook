import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'
import { isBankSyncFeatureEnabled } from '@/services/bank-sync/backend'
import { getSharedLedgerSession } from '@/services/shared-ledger/backend'
import { isHomeRoute } from '@/ui/services/navigation-back.service'
import { queueDeferredScrollRestore, rememberHomeScrollPosition } from '@/ui/services/route-scroll.service'

if (typeof window !== 'undefined' && window.history && 'scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual'
}

function shouldUseWebHashRouter() {
  return String(import.meta.env.VITE_WEB_HASH_ROUTER ?? '').trim() === 'true'
}

function createAppRouterHistory() {
  const base = import.meta.env.BASE_URL
  // Hosted GitHub Pages nested SPA (www.strawmb.com/app/) cannot use path history:
  // unknown /app/<route> falls through to the marketing-site 404.html.
  if (shouldUseWebHashRouter()) return createWebHashHistory(base)
  return createWebHistory(base)
}

const router = createRouter({
  history: createAppRouterHistory(),
  scrollBehavior(_to, _from, savedPosition) {
    queueDeferredScrollRestore(savedPosition ?? { left: 0, top: 0 })
    return false
  },
  routes: [
    {
      name: 'shared-ledger-open',
      path: '/open/shared-ledger',
      redirect: (to) => ({
        path: '/settings/shared-ledgers',
        query: to.query,
      }),
    },
    {
      name: 'shared-ledger-join',
      path: '/shared-ledger/join',
      redirect: (to) => ({
        path: '/settings/shared-ledgers',
        query: to.query,
      }),
    },
    {
      name: 'home',
      path: '/',
      component: () => import('@/ui/views/home.vue'),
      meta: { tab: 'home' },
    },
    {
      name: 'budget',
      path: '/budget',
      component: () => import('@/ui/views/BudgetDisplayPage.vue'),
      meta: { tab: 'budget' },
    },
    {
      name: 'budget-settings',
      path: '/budget/settings',
      component: () => import('@/ui/views/budgeting.vue'),
      meta: { tab: 'budget' },
    },
    {
      name: 'analysis',
      path: '/analysis',
      component: () => import('@/ui/views/analysis.vue'),
      meta: { tab: 'analysis' },
    },
    {
      name: 'analysis-print',
      path: '/analysis/print',
      component: () => import('@/ui/views/AnalysisPrintPage.vue'),
      meta: { tab: 'analysis', hideAppChrome: true },
    },
    {
      name: 'analysis-category-detail',
      path: '/analysis/category',
      component: () => import('@/ui/views/AnalysisCategoryDetailPage.vue'),
      meta: { tab: 'analysis' },
    },
    {
      name: 'transaction-search',
      path: '/transactions/search',
      component: () => import('@/ui/views/TransactionSearchPage.vue'),
      meta: { tab: 'home' },
    },
    {
      name: 'transaction-quick-add',
      path: '/transactions/quick-add',
      component: () => import('@/ui/views/BookkeepingPage.vue'),
      meta: { tab: 'home', hideAppChrome: true },
    },
    {
      name: 'transaction-qna-add',
      path: '/transactions/qna',
      component: () => import('@/ui/views/BookkeepingPage.vue'),
      meta: { tab: 'home', hideAppChrome: true },
    },
    {
      name: 'transaction-calendar',
      path: '/transactions/calendar',
      component: () => import('@/ui/views/CalendarPage.vue'),
      meta: { tab: 'home' },
    },
    {
      name: 'transaction-about',
      path: '/transactions/:id',
      component: () => import('@/ui/views/TransactionAboutPage.vue'),
      meta: { tab: 'home' },
    },
    {
      name: 'transaction-edit',
      path: '/transactions/:id/edit',
      component: () => import('@/ui/views/TransactionEditPage.vue'),
      meta: { tab: 'home', hideAppChrome: true },
    },
    {
      name: 'features',
      path: '/features',
      component: () => import('@/ui/views/FeatureListPage.vue'),
      meta: { tab: 'features' },
    },
    {
      name: 'post-setup-intro',
      path: '/welcome/intro',
      component: () => import('@/ui/views/PostSetupIntroPage.vue'),
      meta: { allowWithoutSetup: true },
    },
    {
      name: 'ai-auto-bookkeeping',
      path: '/ai-auto-bookkeeping',
      component: () => import('@/ui/views/BookkeepingPage.vue'),
      meta: { tab: 'home', hideAppChrome: true },
    },
    {
      name: 'assets',
      path: '/assets',
      component: () => import('@/ui/views/assets.vue'),
      meta: { tab: 'assets' },
    },
    {
      name: 'icon-picker',
      path: '/icons/pick',
      component: () => import('@/ui/views/IconPickerPage.vue'),
      meta: { hideAppChrome: true },
    },
    {
      name: 'settings',
      path: '/settings',
      component: () => import('@/ui/views/settings.vue'),
      meta: { tab: 'settings' },
    },
    {
      path: '/settings/account',
      name: 'settings-account',
      component: () => import('@/ui/views/settings/SettingsAccountPage.vue'),
      meta: { tab: 'settings', allowWithoutSetup: true },
    },
    {
      path: '/settings/data-management',
      name: 'settings-data-management',
      component: () => import('@/ui/views/settings/SettingsDataManagementPage.vue'),
      // smb298: Welcome empty-ledger restore needs IndexedDB recovery list/download/restore.
      // restore_backup_action still points to auto-backup; this allows the separate
      // local_recovery_action link without bouncing back to Welcome.
      meta: { tab: 'settings', allowWithoutSetup: true },
    },
    {
      path: '/settings/auto-backup',
      name: 'settings-auto-backup',
      component: () => import('@/ui/views/settings/SettingsAutoBackupPage.vue'),
      // SMB-215 v1.3.2: WelcomePage step 2 「恢復備份」now points here
      // (Tester clarified that the entry must lead to a page with
      // *automatic backup items* — Google Drive / WebDAV connected
      // accounts that can run 立即還原 — not the manual JSON/CSV import
      // surface). allowWithoutSetup is required so that 0-ledger users
      // arriving from the wizard aren't bounced back by
      // shouldShowWelcomePage. The page itself does not require a
      // ledger to connect / sign in / 立即還原.
      meta: { tab: 'settings', allowWithoutSetup: true },
    },
    {
      path: '/settings/google-drive-ledger-sync',
      name: 'settings-google-drive-ledger-sync',
      component: () => import('@/ui/views/settings/SettingsGoogleDriveLedgerSyncPage.vue'),
      // SMB-215 v1.3.1: see settings-data-management above — WelcomePage
      // step 2 「帳本同步」entry needs allowWithoutSetup, otherwise the
      // button is dead.
      meta: { tab: 'settings', allowWithoutSetup: true },
    },
    {
      path: '/settings/exchange-rate',
      name: 'settings-exchange-rate',
      component: () => import('@/ui/views/settings/SettingsExchangeRatePage.vue'),
      meta: { tab: 'settings' },
    },
    {
      path: '/settings/bank-sync',
      name: 'settings-bank-sync',
      component: () => import('@/ui/views/settings/SettingsBankSyncPage.vue'),
      meta: { tab: 'settings' },
    },
    {
      path: '/settings/bank-sync/new',
      name: 'settings-bank-sync-create',
      component: () => import('@/ui/views/settings/SettingsBankSyncCreatePage.vue'),
      meta: { tab: 'settings', hideAppChrome: true },
    },
    {
      path: '/settings/bank-sync/:id',
      name: 'settings-bank-sync-connection',
      component: () => import('@/ui/views/settings/SettingsBankSyncConnectionPage.vue'),
      meta: { tab: 'settings' },
    },
    {
      path: '/settings/carrier-sync',
      name: 'settings-carrier-sync',
      component: () => import('@/ui/views/settings/SettingsCarrierSyncPage.vue'),
      meta: { tab: 'settings' },
    },
    {
      path: '/settings/wear-companion',
      name: 'settings-wear-companion',
      component: () => import('@/ui/views/settings/SettingsWearCompanionPage.vue'),
      meta: { tab: 'settings' },
    },
    {
      path: '/einvoice-import',
      name: 'einvoice-import',
      redirect: { name: 'settings-carrier-sync' },
    },
    {
      path: '/settings/ledgers',
      name: 'settings-ledgers',
      component: () => import('@/ui/views/settings/SettingsLedgerPage.vue'),
      meta: { tab: 'settings' },
    },
    {
      path: '/settings/shared-ledgers',
      name: 'settings-shared-ledgers',
      component: () => import('@/ui/views/settings/SettingsSharedLedgerPage.vue'),
      meta: { tab: 'settings', allowWithoutSetup: true },
    },
    {
      path: '/settings/ledgers/:id',
      name: 'settings-ledger-detail',
      component: () => import('@/ui/views/settings/SettingsLedgerDetailPage.vue'),
      meta: { tab: 'settings' },
    },
    {
      path: '/settings/categories',
      name: 'settings-categories',
      component: () => import('@/ui/views/settings/SettingsCategoryPage.vue'),
      meta: { tab: 'settings' },
    },
    {
      path: '/settings/categories/:id',
      name: 'settings-category-detail',
      component: () => import('@/ui/views/settings/SettingsCategoryDetailPage.vue'),
      meta: { tab: 'settings' },
    },
    {
      path: '/settings/category-groups/:id',
      name: 'settings-category-group-detail',
      component: () => import('@/ui/views/settings/SettingsCategoryGroupDetailPage.vue'),
      meta: { tab: 'settings' },
    },
    {
      path: '/settings/personalization',
      name: 'settings-personalization',
      component: () => import('@/ui/views/settings/SettingsPersonalizationPage.vue'),
      meta: { tab: 'settings', allowWithoutSetup: true },
    },
    {
      path: '/settings/language',
      name: 'settings-language',
      component: () => import('@/ui/views/settings/SettingsLanguagePage.vue'),
      meta: { tab: 'settings' },
    },
    {
      path: '/settings/security',
      name: 'settings-security',
      component: () => import('@/ui/views/settings/SettingsSecurityPage.vue'),
      meta: { tab: 'settings' },
    },
    {
      path: '/settings/bookkeeping-reminder',
      name: 'settings-bookkeeping-reminder',
      component: () => import('@/ui/views/settings/SettingsBookkeepingReminderPage.vue'),
      meta: { tab: 'settings' },
    },
    {
      path: '/settings/addon-templates',
      name: 'settings-addon-templates',
      component: () => import('@/ui/views/settings/SettingsAddonTemplatePage.vue'),
      meta: { tab: 'settings' },
    },
    {
      path: '/settings/auto-fill-rules',
      name: 'settings-auto-fill-rules',
      component: () => import('@/ui/views/settings/SettingsAutoFillRulesPage.vue'),
      meta: { tab: 'settings' },
    },
    {
      path: '/settings/auto-fill-rules/new',
      name: 'settings-auto-fill-rule-create',
      component: () => import('@/ui/views/settings/SettingsAutoFillRuleEditPage.vue'),
      meta: { tab: 'settings', hideAppChrome: true },
    },
    {
      path: '/settings/auto-fill-rules/:id',
      name: 'settings-auto-fill-rule-edit',
      component: () => import('@/ui/views/settings/SettingsAutoFillRuleEditPage.vue'),
      meta: { tab: 'settings', hideAppChrome: true },
    },
    {
      path: '/settings/version-info',
      name: 'settings-version-info',
      component: () => import('@/ui/views/settings/SettingsVersionInfoPage.vue'),
      meta: { tab: 'settings' },
    },
    {
      path: '/settings/developer-debug',
      name: 'settings-developer-debug',
      component: () => import('@/ui/views/settings/SettingsDeveloperDebugPage.vue'),
      meta: { tab: 'settings' },
    },
    {
      path: '/settings/admin',
      name: 'settings-admin',
      component: () => import('@/ui/views/settings/SettingsAdminPage.vue'),
      meta: { tab: 'settings' },
    },
    {
      path: '/settings/admin/users/:id',
      name: 'settings-admin-user',
      component: () => import('@/ui/views/settings/SettingsAdminMemberPage.vue'),
      props: true,
      meta: { tab: 'settings' },
    },
    {
      path: '/settings/membership-benefits',
      name: 'settings-membership-benefits',
      component: () => import('@/ui/views/settings/SettingsMembershipBenefitsPage.vue'),
      meta: { tab: 'settings' },
    },
    {
      path: '/settings/about',
      name: 'settings-about',
      component: () => import('@/ui/views/settings/SettingsAboutPage.vue'),
      meta: { tab: 'settings' },
    },
    {
      name: 'loans',
      path: '/loans',
      component: () => import('@/ui/views/loans/LoanListPage.vue'),
      meta: { tab: 'home', transitionKey: 'loans' },
    },
    {
      name: 'loan-counterparty-detail',
      path: '/loans/counterparty',
      component: () => import('@/ui/views/loans/LoanCounterpartyDetailPage.vue'),
      meta: { tab: 'home', transitionKey: 'loan-counterparty-detail' },
    },
    {
      name: 'loan-detail',
      path: '/loans/:id',
      component: () => import('@/ui/views/loans/LoanDetailPage.vue'),
      props: true,
      meta: { tab: 'home' },
    },
    {
      name: 'reimbursements',
      path: '/reimbursements',
      component: () => import('@/ui/views/reimbursements/ReimbursementListPage.vue'),
      meta: { tab: 'home' },
    },
    {
      name: 'reimbursement-advance-manage',
      path: '/reimbursements/advances',
      component: () => import('@/ui/views/reimbursements/ReimbursementAdvanceManagementPage.vue'),
      meta: { tab: 'home' },
    },
    {
      name: 'reimbursement-advance-usage-manage',
      path: '/reimbursements/advance-usages',
      component: () => import('@/ui/views/reimbursements/ReimbursementAdvanceUsageManagementPage.vue'),
      meta: { tab: 'home' },
    },
    {
      name: 'claim-sheets',
      path: '/claim-sheets',
      component: () => import('@/ui/views/claims/ClaimSheetListPage.vue'),
      meta: { tab: 'home', transitionKey: 'claim-sheets' },
    },
    {
      name: 'claim-sheet-edit',
      path: '/claim-sheets/:id/edit',
      component: () => import('@/ui/views/claims/ClaimSheetEditPage.vue'),
      props: true,
      meta: { tab: 'home', hideAppChrome: true },
    },
    {
      name: 'claim-sheet-import',
      path: '/claim-sheets/:id/import-reimbursements',
      component: () => import('@/ui/views/claims/ClaimSheetImportPage.vue'),
      props: true,
      meta: { tab: 'home', hideAppChrome: true },
    },
    {
      name: 'claim-sheet-import-borrow-loan',
      path: '/claim-sheets/:id/import-borrow-loans',
      component: () => import('@/ui/views/claims/ClaimSheetImportBorrowLoanPage.vue'),
      props: true,
      meta: { tab: 'home', hideAppChrome: true },
    },
    {
      name: 'claim-sheet-detail',
      path: '/claim-sheets/:id',
      component: () => import('@/ui/views/claims/ClaimSheetDetailPage.vue'),
      props: true,
      meta: { tab: 'home' },
    },
    {
      name: 'savings-jars',
      path: '/savings-jars',
      component: () => import('@/ui/views/savings-jars/SavingsJarListPage.vue'),
      meta: { tab: 'home' },
    },
    {
      name: 'subscriptions',
      path: '/subscriptions',
      component: () => import('@/ui/views/subscriptions/SubscriptionListPage.vue'),
      meta: { tab: 'home' },
    },
    {
      name: 'reimbursement-edit',
      path: '/reimbursements/:id/edit',
      component: () => import('@/ui/views/reimbursements/ReimbursementEditPage.vue'),
      props: true,
      meta: { tab: 'home', hideAppChrome: true },
    },
    {
      name: 'reimbursement-offset-about',
      path: '/reimbursements/:id/offsets',
      component: () => import('@/ui/views/reimbursements/ReimbursementOffsetAboutPage.vue'),
      props: true,
      meta: { tab: 'home' },
    },
    {
      name: 'account-detail',
      path: '/accounts/:id',
      component: () => import('@/ui/views/accounts/AccountDetailPage.vue'),
      props: true,
    },
    {
      name: 'asset-account-management',
      path: '/assets/accounts',
      component: () => import('@/ui/views/accounts/AssetAccountManagementPage.vue'),
      meta: { tab: 'assets' },
    },
    {
      name: 'securities',
      path: '/assets/securities',
      component: () => import('@/ui/views/securities/SecuritiesListPage.vue'),
      meta: { tab: 'assets' },
    },
    {
      name: 'credit-cards',
      path: '/credit-cards',
      component: () => import('@/ui/views/credit-cards/CreditCardsPage.vue'),
      meta: { tab: 'features' },
    },
    {
      name: 'security-detail',
      path: '/assets/securities/:id',
      component: () => import('@/ui/views/securities/SecurityDetailPage.vue'),
      props: true,
      meta: { tab: 'assets' },
    },
    {
      name: 'asset-account-group-detail',
      path: '/assets/account-groups/:id',
      component: () => import('@/ui/views/accounts/AssetAccountGroupDetailPage.vue'),
      meta: { tab: 'assets' },
    },
  ],
})

const BANK_SYNC_ROUTE_NAMES = new Set([
  'settings-bank-sync',
  'settings-bank-sync-create',
  'settings-bank-sync-connection',
])

const ADMIN_ROUTE_NAMES = new Set([
  'settings-admin',
  'settings-admin-user',
])

router.beforeEach((to, from) => {
  // Capture home window scroll before leaving so delete/edit return can restore it.
  if (isHomeRoute(from) && !isHomeRoute(to)) {
    rememberHomeScrollPosition()
  }
  if (BANK_SYNC_ROUTE_NAMES.has(String(to.name ?? '')) && !isBankSyncFeatureEnabled()) {
    return { name: 'settings' }
  }
  if (ADMIN_ROUTE_NAMES.has(String(to.name ?? '')) && !Boolean(getSharedLedgerSession()?.user?.is_admin)) {
    return { name: 'settings' }
  }
  return true
})

export default router
