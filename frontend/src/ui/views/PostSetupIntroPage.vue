<template>
  <section class="intro-root">
    <article class="card intro-card">
      <header class="hero-block">
        <div class="hero-copy">
          <p class="eyebrow">{{ t('post_setup_intro.eyebrow', '初始化完成') }}</p>
          <h2>{{ t('post_setup_intro.title', '用 1 分鐘快速認識 StrawMoneyBook') }}</h2>
          <p class="muted hero-desc">
            {{ t('post_setup_intro.subtitle', '依序看完 4 個重點功能，就能更快上手同步、登入與會員邀請。') }}
          </p>
        </div>

        <div class="progress-strip" aria-label="post-setup intro progress">
          <button
            v-for="(item, index) in slides"
            :key="item.id"
            type="button"
            class="progress-dot"
            :class="{ active: index === currentIndex }"
            :aria-label="item.title"
            @click="jumpTo(index)"
          />
        </div>
      </header>

      <transition name="wizard-slide" mode="out-in">
        <section :key="currentSlide.id" class="content-grid">
          <div class="overview-panel">
            <div class="icon-badge">
              <font-awesome-icon :icon="currentSlide.icon" />
            </div>
            <p class="slide-step">{{ t('post_setup_intro.step', { step: currentIndex + 1 }, '第 {step} / 4 步') }}</p>
            <h3>{{ currentSlide.title }}</h3>
            <p class="muted slide-desc">{{ currentSlide.description }}</p>
            <button type="button" class="btn quick-link" @click="openCurrentDestination">
              <font-awesome-icon icon="fa-solid fa-arrow-up-right-from-square" />
              <span>{{ currentSlide.actionLabel }}</span>
            </button>
          </div>

          <div class="detail-panel">
            <article class="highlight-card">
              <p class="highlight-label">{{ t('post_setup_intro.key_takeaway', '你現在可以做什麼') }}</p>
              <p class="highlight-copy">{{ currentSlide.highlight }}</p>
            </article>

            <ul class="point-list">
              <li v-for="point in currentSlide.points" :key="point">
                <span class="point-marker">
                  <font-awesome-icon icon="fa-solid fa-check" />
                </span>
                <span>{{ point }}</span>
              </li>
            </ul>
          </div>
        </section>
      </transition>

      <footer class="intro-actions">
        <button type="button" class="btn" :disabled="currentIndex === 0" @click="goPrev">
          {{ t('common.back') }}
        </button>
        <button type="button" class="btn" @click="finishIntro">
          {{ t('post_setup_intro.skip', '先開始使用') }}
        </button>
        <button type="button" class="btn primary" @click="goNext">
          {{ isLastSlide ? t('post_setup_intro.finish', '完成並進入首頁') : t('welcome.next') }}
        </button>
      </footer>
    </article>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from '@/ui/services/i18n.service'
import {
  completePostSetupIntro,
  isPostSetupIntroPending,
} from '@/ui/services/post-setup-intro.service'

const router = useRouter()
const { t } = useI18n()
const currentIndex = ref(0)

const slides = computed(() => ([
  {
    id: 'features',
    icon: 'fa-solid fa-sparkles',
    title: t('post_setup_intro.features.title', '特色功能介紹'),
    description: t('post_setup_intro.features.description', '除了基本記帳，還可以直接延伸到借貸、報銷、存錢罐與訂閱追蹤。'),
    highlight: t('post_setup_intro.features.highlight', '從首頁旁的功能列表，可以快速打開較進階的管理頁。'),
    actionLabel: t('post_setup_intro.features.action', '前往功能列表'),
    to: '/features',
    points: [
      t('post_setup_intro.features.point_1', 'AI 記帳、快速新增與搜尋交易都已經可以直接使用。'),
      t('post_setup_intro.features.point_2', '借貸、報銷、請款單與訂閱管理都整合在同一套帳本內。'),
      t('post_setup_intro.features.point_3', '之後要找進階功能，先從首頁右上角選單開始最快。'),
    ],
  },
  {
    id: 'bank-sync',
    icon: 'fa-solid fa-building-columns',
    title: t('post_setup_intro.bank_sync.title', '銀行同步'),
    description: t('post_setup_intro.bank_sync.description', '可在 Android App 內新增銀行連線，之後把銀行交易同步進來，再決定是否匯入帳本。'),
    highlight: t('post_setup_intro.bank_sync.highlight', '每家銀行都有自己的管理頁，可分別查看同步時間、帳戶對應與匯入狀態。'),
    actionLabel: t('post_setup_intro.bank_sync.action', '前往銀行同步'),
    to: '/settings/bank-sync',
    points: [
      t('post_setup_intro.bank_sync.point_1', '第一次新增連線後，就能在管理頁啟用、同步與查看明細。'),
      t('post_setup_intro.bank_sync.point_2', '匯入前可先用自動識別規則，把轉帳或固定描述自動分類。'),
      t('post_setup_intro.bank_sync.point_3', '同步資料與記帳資料分開管理，整理完成後再決定哪些交易要正式匯入。'),
    ],
  },
  {
    id: 'account-login',
    icon: 'fa-solid fa-user-shield',
    title: t('post_setup_intro.account.title', '帳號登入'),
    description: t('post_setup_intro.account.description', '登入後可同步共享帳本、管理個人資料，也能把 Google 登入綁定到帳號。'),
    highlight: t('post_setup_intro.account.highlight', '如果你打算跨裝置或和別人共同記帳，這一步會很值得先做。'),
    actionLabel: t('post_setup_intro.account.action', '前往帳號設定'),
    to: '/settings/account',
    points: [
      t('post_setup_intro.account.point_1', '支援 Email / 密碼與 Google 登入，之後都能在同一頁管理。'),
      t('post_setup_intro.account.point_2', '登入後可以加入共同帳本，也能管理密碼、個人名稱與安全設定。'),
      t('post_setup_intro.account.point_3', '如果你是從邀請連結進來，登入後也能直接接續相關流程。'),
    ],
  },
  {
    id: 'membership-referral',
    icon: 'fa-solid fa-gift',
    title: t('post_setup_intro.membership.title', '會員推廣與邀請碼'),
    description: t('post_setup_intro.membership.description', '登入帳號後，就能分享自己的邀請碼，或輸入朋友提供的邀請碼領取對應獎勵。'),
    highlight: t('post_setup_intro.membership.highlight', '邀請碼輸入入口就在帳號頁，會員權益頁則能查看方案內容與升級方式。'),
    actionLabel: t('post_setup_intro.membership.action', '前往帳號與邀請碼'),
    to: '/settings/account',
    points: [
      t('post_setup_intro.membership.point_1', '邀請人與被邀請人都需要先登入帳號，才能啟用推廣獎勵。'),
      t('post_setup_intro.membership.point_2', '帳號頁可以複製自己的邀請碼，也能直接貼上朋友分享的邀請碼。'),
      t('post_setup_intro.membership.point_3', '若想先看會員方案差異，也可以從設定中的會員權益頁進一步查看。'),
    ],
  },
]))

const currentSlide = computed(() => slides.value[currentIndex.value] ?? slides.value[0])
const isLastSlide = computed(() => currentIndex.value >= slides.value.length - 1)

function jumpTo(index) {
  currentIndex.value = Math.min(Math.max(index, 0), slides.value.length - 1)
}

function goPrev() {
  jumpTo(currentIndex.value - 1)
}

async function openCurrentDestination() {
  await completeAndNavigate(currentSlide.value.to)
}

async function goNext() {
  if (!isLastSlide.value) {
    jumpTo(currentIndex.value + 1)
    return
  }
  await finishIntro()
}

async function finishIntro() {
  await completeAndNavigate('/')
}

async function completeAndNavigate(path) {
  completePostSetupIntro()
  await router.replace(path)
}

onMounted(async () => {
  if (!isPostSetupIntroPending()) {
    await router.replace('/')
  }
})
</script>

<style scoped>
.intro-root {
  min-height: 100%;
  display: grid;
  place-items: center;
  padding: 18px;
}
.intro-card {
  width: min(760px, 100%);
  padding: 20px;
  display: grid;
  gap: 18px;
  border: 1px solid var(--field-border);
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--primary) 14%, transparent), transparent 32%),
    radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--ok) 12%, transparent), transparent 28%),
    var(--card);
}
.hero-block {
  display: grid;
  gap: 14px;
}
.hero-copy {
  display: grid;
  gap: 8px;
}
.eyebrow {
  margin: 0;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--primary);
}
h2,
h3,
.hero-desc,
.slide-step,
.slide-desc,
.highlight-label,
.highlight-copy {
  margin: 0;
}
.progress-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.progress-dot {
  height: 8px;
  border: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted) 20%, transparent);
  cursor: pointer;
}
.progress-dot.active {
  background: linear-gradient(90deg, var(--primary), color-mix(in srgb, var(--ok) 62%, var(--primary)));
}
.content-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
  gap: 14px;
}
.overview-panel,
.detail-panel {
  display: grid;
  gap: 12px;
}
.overview-panel {
  padding: 18px;
  border-radius: 20px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--primary) 14%, var(--card)), color-mix(in srgb, var(--surface-soft-accent) 82%, var(--card)));
  border: 1px solid color-mix(in srgb, var(--primary) 14%, var(--field-border));
}
.icon-badge {
  width: 52px;
  height: 52px;
  border-radius: 18px;
  display: grid;
  place-items: center;
  font-size: 22px;
  color: var(--primary);
  background: color-mix(in srgb, var(--card) 42%, white);
  box-shadow: var(--shadow-card);
}
.slide-step {
  font-size: 13px;
  color: var(--muted);
}
.slide-desc {
  line-height: 1.65;
}
.quick-link {
  justify-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.highlight-card {
  padding: 16px;
  border-radius: 18px;
  border: 1px solid var(--field-border);
  background: var(--surface-soft-accent);
  display: grid;
  gap: 8px;
}
.highlight-label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}
.highlight-copy {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.6;
}
.point-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 10px;
}
.point-list li {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  padding: 12px 14px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--card) 64%, var(--surface-soft-accent));
  border: 1px solid var(--field-border);
}
.point-marker {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--ok) 18%, transparent);
  color: var(--ok);
}
.intro-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

@media (max-width: 720px) {
  .intro-root {
    padding: 10px;
  }
  .intro-card {
    padding: 16px;
  }
  .content-grid {
    grid-template-columns: 1fr;
  }
  .intro-actions > * {
    flex: 1 1 calc(50% - 4px);
  }
}
</style>
