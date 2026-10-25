import { translateMessage } from '@/ui/services/i18n.service.js'

const ACCOUNT_ICON_OPTIONS = [
  // Core money/account
  { value: 'fa-solid fa-wallet', label: '錢包' },
  { value: 'fa-solid fa-money-bill-wave', label: '現金' },
  { value: 'fa-solid fa-money-bill', label: '紙鈔現鈔' },
  { value: 'fa-solid fa-piggy-bank', label: '存錢' },
  { value: 'fa-solid fa-coins', label: '零錢' },
  { value: 'fa-solid fa-money-bill-1-wave', label: '薪轉帳戶' },
  { value: 'fa-solid fa-money-check-dollar', label: '支票' },
  { value: 'fa-solid fa-sack-dollar', label: '資金' },
  { value: 'fa-solid fa-circle-dollar-to-slot', label: '儲值餘額' },
  { value: 'fa-solid fa-money-bill-trend-up', label: '收益成長' },

  // Financial institutions
  { value: 'fa-solid fa-building-columns', label: '銀行' },
  { value: 'fa-solid fa-building', label: '公司金庫' },
  { value: 'fa-solid fa-credit-card', label: '信用卡' },
  { value: 'fa-solid fa-mobile-screen-button', label: '行動支付' },
  { value: 'fa-solid fa-mobile', label: '手機錢包' },
  { value: 'fa-solid fa-landmark', label: '證券' },
  { value: 'fa-solid fa-chart-line', label: '投資曲線' },
  { value: 'fa-solid fa-chart-pie', label: '資產配置' },
  { value: 'fa-solid fa-percent', label: '貸款利率' },

  // Bookkeeping / recurring
  { value: 'fa-solid fa-book', label: '帳本' },
  { value: 'fa-solid fa-receipt', label: '收據票據' },
  { value: 'fa-solid fa-calendar-days', label: '固定收支' },
  { value: 'fa-solid fa-clock-rotate-left', label: '週期帳務' },
  { value: 'fa-solid fa-ticket', label: '票券點數' },
  { value: 'fa-solid fa-gift', label: '禮券儲值' },

  // Scenario
  { value: 'fa-solid fa-shield-heart', label: '保險保障' },
  { value: 'fa-solid fa-arrow-trend-up', label: '投資理財' },
  { value: 'fa-solid fa-house-laptop', label: '在家工作' },
  { value: 'fa-solid fa-house', label: '家用' },
  { value: 'fa-solid fa-vault', label: '保管箱' },
  { value: 'fa-solid fa-lock', label: '緊急預備金' },
  { value: 'fa-solid fa-key', label: '房租押金' },
  { value: 'fa-solid fa-gem', label: '貴重資產' },
  { value: 'fa-solid fa-crown', label: '主力帳戶' },
]

const CATEGORY_ICON_OPTIONS = [
  { value: 'fa-solid fa-utensils', label: '餐飲' },
  { value: 'fa-solid fa-bowl-food', label: '三餐' },
  { value: 'fa-solid fa-mug-hot', label: '咖啡茶飲' },
  { value: 'fa-solid fa-coffee', label: '咖啡館' },
  { value: 'fa-solid fa-burger', label: '速食' },
  { value: 'fa-solid fa-pizza-slice', label: '披薩義食' },
  { value: 'fa-solid fa-ice-cream', label: '甜點冰品' },
  { value: 'fa-solid fa-beer-mug-empty', label: '酒吧酒水' },
  { value: 'fa-solid fa-bottle-water', label: '飲水飲料' },
  { value: 'fa-solid fa-bottle-droplet', label: '瓶裝飲品' },
  { value: 'fa-solid fa-apple-whole', label: '水果' },
  { value: 'fa-solid fa-basket-shopping', label: '菜籃採買' },
  { value: 'fa-solid fa-cart-shopping', label: '日常採買' },
  { value: 'fa-solid fa-bag-shopping', label: '購物' },
  { value: 'fa-solid fa-store', label: '賣場超市' },
  { value: 'fa-solid fa-shop', label: '商店' },
  { value: 'fa-solid fa-shirt', label: '服飾' },
  { value: 'fa-solid fa-scissors', label: '美容理髮' },
  { value: 'fa-solid fa-soap', label: '清潔用品' },
  { value: 'fa-solid fa-shower', label: '生活用品' },
  { value: 'fa-solid fa-lightbulb', label: '水電瓦斯' },
  { value: 'fa-solid fa-droplet', label: '水費用水' },
  { value: 'fa-solid fa-plug', label: '電費家電' },
  { value: 'fa-solid fa-car', label: '交通' },
  { value: 'fa-solid fa-bicycle', label: '自行車' },
  { value: 'fa-solid fa-motorcycle', label: '機車' },
  { value: 'fa-solid fa-taxi', label: '計程車' },
  { value: 'fa-solid fa-gas-pump', label: '油資' },
  { value: 'fa-solid fa-bus', label: '大眾運輸' },
  { value: 'fa-solid fa-train', label: '火車捷運' },
  { value: 'fa-solid fa-train-subway', label: '地鐵' },
  { value: 'fa-solid fa-house', label: '居家' },
  { value: 'fa-solid fa-house-medical', label: '居家照護' },
  { value: 'fa-solid fa-hammer', label: '修繕' },
  { value: 'fa-solid fa-wrench', label: '維修保養' },
  { value: 'fa-solid fa-box-archive', label: '倉儲收納' },
  { value: 'fa-solid fa-key', label: '鑰匙租屋' },
  { value: 'fa-solid fa-lock', label: '保全門鎖' },
  { value: 'fa-solid fa-building', label: '辦公場地' },
  { value: 'fa-solid fa-film', label: '娛樂' },
  { value: 'fa-solid fa-ticket', label: '票券展演' },
  { value: 'fa-solid fa-gamepad', label: '遊戲' },
  { value: 'fa-solid fa-music', label: '音樂' },
  { value: 'fa-solid fa-tv', label: '影音訂閱' },
  { value: 'fa-solid fa-camera', label: '攝影' },
  { value: 'fa-solid fa-brush', label: '美術創作' },
  { value: 'fa-solid fa-futbol', label: '球類運動' },
  { value: 'fa-solid fa-basketball', label: '籃球' },
  { value: 'fa-solid fa-baseball', label: '棒球' },
  { value: 'fa-solid fa-volleyball', label: '排球' },
  { value: 'fa-solid fa-person-running', label: '跑步健身' },
  { value: 'fa-solid fa-dumbbell', label: '健身房' },
  { value: 'fa-solid fa-sun', label: '戶外活動' },
  { value: 'fa-solid fa-moon', label: '夜生活' },
  { value: 'fa-solid fa-champagne-glasses', label: '聚餐聚會' },
  { value: 'fa-solid fa-cake-candles', label: '慶生活動' },
  { value: 'fa-solid fa-briefcase', label: '工作' },
  { value: 'fa-solid fa-toolbox', label: '工具設備' },
  { value: 'fa-solid fa-laptop', label: '3C設備' },
  { value: 'fa-solid fa-wifi', label: '網路通訊' },
  { value: 'fa-solid fa-phone', label: '電話費' },
  { value: 'fa-solid fa-graduation-cap', label: '學習' },
  { value: 'fa-solid fa-school', label: '校園' },
  { value: 'fa-solid fa-book-open', label: '書籍課程' },
  { value: 'fa-solid fa-heart-pulse', label: '健康醫療' },
  { value: 'fa-solid fa-stethoscope', label: '健康檢測' },
  { value: 'fa-solid fa-hospital', label: '醫院門診' },
  { value: 'fa-solid fa-kit-medical', label: '醫療用品' },
  { value: 'fa-solid fa-notes-medical', label: '醫療檢查' },
  { value: 'fa-solid fa-briefcase-medical', label: '專科治療' },
  { value: 'fa-solid fa-pills', label: '藥品' },
  { value: 'fa-solid fa-capsules', label: '保健食品' },
  { value: 'fa-solid fa-syringe', label: '疫苗注射' },
  { value: 'fa-solid fa-tooth', label: '牙科' },
  { value: 'fa-solid fa-glasses', label: '眼鏡視力' },
  { value: 'fa-solid fa-gift', label: '禮物' },
  { value: 'fa-solid fa-users', label: '社交聚會' },
  { value: 'fa-solid fa-user-group', label: '家庭支出' },
  { value: 'fa-solid fa-child', label: '兒童' },
  { value: 'fa-solid fa-baby', label: '嬰幼兒' },
  { value: 'fa-solid fa-dog', label: '寵物狗' },
  { value: 'fa-solid fa-cat', label: '寵物貓' },
  { value: 'fa-solid fa-paw', label: '寵物用品' },
  { value: 'fa-solid fa-fish', label: '水族海鮮' },
  { value: 'fa-solid fa-seedling', label: '園藝植栽' },
  { value: 'fa-solid fa-tree', label: '戶外露營' },
  { value: 'fa-solid fa-plane', label: '旅遊' },
  { value: 'fa-solid fa-location-dot', label: '景點行程' },
  { value: 'fa-solid fa-receipt', label: '帳單' },
  { value: 'fa-solid fa-file-invoice-dollar', label: '發票稅務' },
  { value: 'fa-solid fa-tag', label: '一般分類' },
  { value: 'fa-solid fa-wand-magic-sparkles', label: '其他雜項' },
  { value: 'fa-solid fa-hand-holding-dollar', label: '補助回饋' },
  { value: 'fa-solid fa-sack-dollar', label: '薪資獎金' },
  { value: 'fa-solid fa-arrow-trend-up', label: '投資收益' },
  { value: 'fa-solid fa-money-bill-trend-up', label: '投資成長' },
  { value: 'fa-solid fa-chart-line', label: '股票基金' },
  { value: 'fa-solid fa-percent', label: '利息費率' },
  { value: 'fa-solid fa-gem', label: '精品收藏' },
  { value: 'fa-solid fa-circle-dollar-to-slot', label: '小費捐款' },
  { value: 'fa-solid fa-money-check-dollar', label: '報酬津貼' },
  { value: 'fa-solid fa-money-bill-transfer', label: '轉帳收支' },
]

function iconSlug(value) {
  const tokens = String(value ?? '').split(/\s+/).filter((token) => (
    token.startsWith('fa-')
    && token !== 'fa-solid'
    && token !== 'fa-regular'
    && token !== 'fa-brands'
  ))
  return String(tokens[tokens.length - 1] ?? '').replace(/^fa-/, '')
}

function translateIconOptions(kind, source) {
  return source.map((item) => {
    const slug = iconSlug(item.value)
    const translated = translateMessage(`icon.${kind}.${slug}`, item.label)
    return {
      ...item,
      label: translated,
      icon: item.value,
      searchText: [item.label, translated, item.value, ...(item.keywords ?? [])].join(' ').toLowerCase(),
    }
  })
}

export function getAccountIconOptions() {
  return translateIconOptions('account', ACCOUNT_ICON_OPTIONS)
}

export function getCategoryIconOptions() {
  return translateIconOptions('category', CATEGORY_ICON_OPTIONS)
}

export const accountIconOptions = getAccountIconOptions()
export const categoryIconOptions = getCategoryIconOptions()

export const defaultAccountIcon = accountIconOptions[0]?.value ?? ''
export const defaultCategoryExpenseIcon = 'fa-solid fa-utensils'
export const defaultCategoryIncomeIcon = 'fa-solid fa-sack-dollar'

export function normalizeFaIcon(value, fallback = '') {
  const source = String(value ?? '').trim()
  if (!source) return fallback

  let style = 'fa-solid'
  let iconName = ''

  for (const token of source.split(/\s+/).filter(Boolean)) {
    if (token === 'fas' || token === 'fa-solid') {
      style = 'fa-solid'
      continue
    }
    if (token === 'far' || token === 'fa-regular') {
      style = 'fa-regular'
      continue
    }
    if (token === 'fab' || token === 'fa-brands') {
      style = 'fa-brands'
      continue
    }

    if (token.startsWith('fa-')) {
      iconName = token
      continue
    }

    if (/^[a-z0-9-]+$/i.test(token)) {
      iconName = `fa-${token.toLowerCase()}`
    }
  }

  if (!iconName || iconName === 'fa-solid' || iconName === 'fa-regular' || iconName === 'fa-brands') {
    return fallback
  }

  return `${style} ${iconName}`
}
