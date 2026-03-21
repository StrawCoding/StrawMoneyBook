export function shouldShowWelcomePage({
  ready,
  allowWithoutSetup,
  hasLedgers,
  hasAccounts,
  routeName,
} = {}) {
  if (!ready) return false
  if (allowWithoutSetup) return false
  if (routeName === 'post-setup-intro') return false
  return !hasLedgers || !hasAccounts
}
