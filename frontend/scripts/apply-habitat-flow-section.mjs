#!/usr/bin/env node
/**
 * One-off helper: card.panel stack blocks → habitat-flow-section (modern IA rollout).
 * Does not touch reference routes (home, analysis hub, budget, features hub, settings hub, assets).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, relative } from 'node:path'

const viewsDir = resolve(import.meta.dirname, '../src/ui/views')

const SKIP = new Set([
  'home.vue',
  'analysis.vue',
  'FeatureListPage.vue',
  'settings.vue',
  'assets.vue',
  'BudgetDisplayPage.vue',
  'budgeting.vue',
])

const TARGETS = [
  'loans/LoanListPage.vue',
  'reimbursements/ReimbursementListPage.vue',
  'claims/ClaimSheetListPage.vue',
  'savings-jars/SavingsJarListPage.vue',
  'subscriptions/SubscriptionListPage.vue',
  'securities/SecuritiesListPage.vue',
  'credit-cards/CreditCardsPage.vue',
  'TransactionSearchPage.vue',
  'CalendarPage.vue',
  'accounts/AssetAccountManagementPage.vue',
]

function patch(source) {
  if (!source.includes('class="card panel')) return null
  let next = source.replaceAll('<article class="card panel', '<section class="habitat-flow-section')
  if (next === source) return null
  // Close tags for these list pages only use card.panel wrappers at stack level.
  next = next.replaceAll('</article>', '</section>')
  return next
}

let changed = 0
for (const rel of TARGETS) {
  const base = rel.split('/').pop()
  if (SKIP.has(base)) continue
  const path = resolve(viewsDir, rel)
  const before = readFileSync(path, 'utf8')
  const after = patch(before)
  if (!after) {
    console.warn(`skip (no card.panel): ${rel}`)
    continue
  }
  writeFileSync(path, after)
  changed += 1
  console.log(`patched ${rel}`)
}

console.log(`done: ${changed} files`)
