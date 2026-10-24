<template>
  <div class="amount-calc-field" :class="{ 'amount-calc-inline': inline }">
    <button
      type="button"
      class="calc-trigger"
      :class="{ 'calc-trigger-empty': !hasPositiveAmount }"
      @click="openCalc"
    >
      <span class="calc-trigger-expr" :class="{ 'has-operator': hasOperator }">{{ triggerLabel }}</span>
      <span v-if="hasOperator && liveResult !== null" class="calc-trigger-preview">= {{ liveResult }}</span>
      <span class="calc-trigger-icon" aria-hidden="true">⌨</span>
    </button>

    <div v-if="inline" class="inline-keypad-wrap">
      <div class="calc-keypad">
        <button type="button" class="btn calc-btn digit-btn" @click="pressDigit('1')">1</button>
        <button type="button" class="btn calc-btn digit-btn" @click="pressDigit('2')">2</button>
        <button type="button" class="btn calc-btn digit-btn" @click="pressDigit('3')">3</button>
        <button type="button" class="btn calc-btn back-btn" @click="pressBackspace">⌫</button>
        <button type="button" class="btn calc-btn digit-btn" @click="pressDigit('4')">4</button>
        <button type="button" class="btn calc-btn digit-btn" @click="pressDigit('5')">5</button>
        <button type="button" class="btn calc-btn digit-btn" @click="pressDigit('6')">6</button>
        <button type="button" class="btn calc-btn op-btn" @click="pressOp('+')">+</button>
        <button type="button" class="btn calc-btn digit-btn" @click="pressDigit('7')">7</button>
        <button type="button" class="btn calc-btn digit-btn" @click="pressDigit('8')">8</button>
        <button type="button" class="btn calc-btn digit-btn" @click="pressDigit('9')">9</button>
        <button type="button" class="btn calc-btn op-btn" @click="pressOp('-')">−</button>
        <button type="button" class="btn calc-btn digit-btn" @click="pressDot">.</button>
        <button type="button" class="btn calc-btn digit-btn" @click="pressDigit('0')">0</button>
        <button
          type="button"
          class="btn calc-btn secondary-btn"
          :data-testid="secondaryTestid || undefined"
          :class="{ busy: confirmBusy }"
          :disabled="confirmBusy"
          @click="onSecondary"
        >
          {{ secondaryLabel || t('quick_add.action.save_and_add') }}
        </button>
        <button
          type="button"
          class="btn calc-btn confirm-btn primary"
          :data-testid="confirmTestid || undefined"
          :class="{ busy: confirmBusy }"
          :disabled="confirmBusy"
          @click="onConfirm"
        >
          {{ confirmLabel || t('common.done') }}
        </button>
      </div>
    </div>

    <teleport v-if="!inline" to="body">
      <transition name="overlay-fade">
        <section v-if="calcOpen" class="app-overlay-sheet-mask" @click.self="onConfirm">
          <article class="card sheet app-bottom-sheet app-overlay-sheet-card calc-sheet">
            <header class="row app-overlay-sheet-head">
              <h3 class="app-overlay-sheet-title">{{ t('quick_add.calculator.title') }}</h3>
              <button type="button" class="btn mini-btn" @click="onConfirm">{{ t('common.done') }}</button>
            </header>

            <div class="calc-display">
              <div class="calc-expr-line">{{ expression || '0' }}</div>
              <div v-if="liveResult !== null && hasOperator" class="calc-result-line">= {{ liveResult }}</div>
            </div>

            <div class="calc-keypad">
              <button type="button" class="btn calc-btn digit-btn" @click="pressDigit('7')">7</button>
              <button type="button" class="btn calc-btn digit-btn" @click="pressDigit('8')">8</button>
              <button type="button" class="btn calc-btn digit-btn" @click="pressDigit('9')">9</button>
              <button type="button" class="btn calc-btn op-btn" @click="pressOp('/')">÷</button>

              <button type="button" class="btn calc-btn digit-btn" @click="pressDigit('4')">4</button>
              <button type="button" class="btn calc-btn digit-btn" @click="pressDigit('5')">5</button>
              <button type="button" class="btn calc-btn digit-btn" @click="pressDigit('6')">6</button>
              <button type="button" class="btn calc-btn op-btn" @click="pressOp('*')">×</button>

              <button type="button" class="btn calc-btn digit-btn" @click="pressDigit('1')">1</button>
              <button type="button" class="btn calc-btn digit-btn" @click="pressDigit('2')">2</button>
              <button type="button" class="btn calc-btn digit-btn" @click="pressDigit('3')">3</button>
              <button type="button" class="btn calc-btn op-btn" @click="pressOp('-')">−</button>

              <button type="button" class="btn calc-btn clear-btn" @click="pressClear">C</button>
              <button type="button" class="btn calc-btn digit-btn" @click="pressDigit('0')">0</button>
              <button type="button" class="btn calc-btn digit-btn" @click="pressDot">.</button>
              <button type="button" class="btn calc-btn op-btn" @click="pressOp('+')">+</button>

              <button type="button" class="btn calc-btn back-btn" @click="pressBackspace">⌫</button>
              <button type="button" class="btn calc-btn eq-btn" @click="pressEqual">=</button>
              <button type="button" class="btn calc-btn confirm-btn primary" @click="onConfirm">
                {{ t('common.done') }}
              </button>
            </div>
          </article>
        </section>
      </transition>
    </teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from '@/ui/services/i18n.service'
import { evaluateAmountExpression, expressionHasOperator } from '@/ui/utils/amount-calculator'

const props = defineProps({
  modelValue: {
    type: Number,
    default: 0,
  },
  allowNegative: {
    type: Boolean,
    default: false,
  },
  inline: {
    type: Boolean,
    default: false,
  },
  confirmLabel: {
    type: String,
    default: '',
  },
  secondaryLabel: {
    type: String,
    default: '',
  },
  confirmTestid: {
    type: String,
    default: '',
  },
  secondaryTestid: {
    type: String,
    default: '',
  },
  confirmBusy: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:modelValue', 'confirm', 'secondary'])
const { t } = useI18n()

const calcOpen = ref(false)
const expression = ref('')

const liveResult = computed(() => evaluateAmountExpression(expression.value))
const hasOperator = computed(() => expressionHasOperator(expression.value))
const hasPositiveAmount = computed(() => {
  const val = Number(props.modelValue ?? 0)
  return Number.isFinite(val) && val > 0
})

const triggerLabel = computed(() => {
  if (expression.value && expression.value !== '0') return expression.value
  const val = Number(props.modelValue ?? 0)
  return val === 0 ? '0' : String(val)
})

function syncExpressionFromModel() {
  const val = Number(props.modelValue ?? 0)
  expression.value = Number.isFinite(val) && (val > 0 || (props.allowNegative && val < 0)) ? String(val) : ''
}

function openCalc() {
  syncExpressionFromModel()
  if (props.inline) return
  calcOpen.value = true
}

function resolvedConfirmValue() {
  const result = liveResult.value
  if (result !== null) return result
  const match = expression.value.match(props.allowNegative ? /^(-?\d+(?:\.\d*)?)/ : /^(\d+(?:\.\d*)?)/)
  if (match) {
    const parsed = parseFloat(match[1])
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

async function commitValue() {
  const value = resolvedConfirmValue()
  emit('update:modelValue', value)
  await nextTick()
  return value
}

async function onConfirm() {
  const value = await commitValue()
  if (props.inline) {
    emit('confirm', value)
    return
  }
  calcOpen.value = false
}

async function onSecondary() {
  const value = await commitValue()
  emit('secondary', value)
}

function pressDigit(d) {
  if (expression.value === '0') {
    expression.value = d
  } else {
    expression.value += d
  }
}

function pressDot() {
  if (!expression.value) {
    expression.value = '0.'
    return
  }
  const lastSegment = expression.value.split(/[+\-*/]/).at(-1) ?? ''
  if (!lastSegment.includes('.')) {
    expression.value += '.'
  }
}

function pressOp(op) {
  if (props.allowNegative && op === '-' && !expression.value) {
    expression.value = '-'
    return
  }
  if (!expression.value) return
  const last = expression.value.at(-1)
  if (['+', '-', '*', '/'].includes(last)) {
    expression.value = expression.value.slice(0, -1) + op
  } else if (last !== '.') {
    expression.value += op
  }
}

function pressClear() {
  expression.value = ''
}

function pressBackspace() {
  expression.value = expression.value.slice(0, -1)
}

function pressEqual() {
  const result = liveResult.value
  if (result !== null) {
    expression.value = String(result)
  }
}

function onRequestCloseOverlay(event) {
  if (!calcOpen.value) return
  onConfirm()
  event.preventDefault()
}

onMounted(() => {
  if (props.inline) syncExpressionFromModel()
  window.addEventListener('app:request-close-overlay', onRequestCloseOverlay)
})

onBeforeUnmount(() => {
  window.removeEventListener('app:request-close-overlay', onRequestCloseOverlay)
})
</script>

<style scoped>
.amount-calc-field {
  display: contents;
}

.amount-calc-inline {
  display: grid;
  gap: 10px;
}

.inline-keypad-wrap {
  min-width: 0;
}

.secondary-btn {
  font-size: 15px;
  background: var(--surface-soft);
}

.calc-trigger {
  width: 100%;
  min-height: 42px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--input-bg);
  color: var(--text);
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 16px;
  text-align: left;
  cursor: pointer;
}

.calc-trigger:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

.calc-trigger-empty {
  border-color: color-mix(in srgb, var(--primary) 45%, var(--border));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary) 12%, transparent);
}

.calc-trigger-expr {
  flex: 1;
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.calc-trigger-expr.has-operator {
  color: var(--muted);
  font-weight: 400;
}

.calc-trigger-preview {
  font-weight: 700;
  color: var(--primary);
  white-space: nowrap;
}

.calc-trigger-icon {
  color: var(--muted);
  font-size: 14px;
  flex-shrink: 0;
}

.calc-sheet {
  width: min(480px, 100vw);
  max-width: 100vw;
  box-sizing: border-box;
  border-radius: 18px 18px 0 0;
  padding: 14px 14px calc(14px + var(--navigation-bar-height));
}

.calc-display {
  margin: 10px 0 14px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface-soft);
  min-height: 56px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.calc-expr-line {
  font-size: 20px;
  font-weight: 600;
  color: var(--text);
  word-break: break-all;
  text-align: right;
}

.calc-result-line {
  font-size: 15px;
  color: var(--primary);
  font-weight: 500;
}

.calc-keypad {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.calc-btn {
  min-height: 56px;
  font-size: 20px;
  font-weight: 600;
  border-radius: 12px;
  justify-content: center;
}

.digit-btn {
  background: var(--surface-soft);
}

.op-btn {
  background: color-mix(in srgb, var(--primary) 12%, var(--surface-soft) 88%);
  color: var(--primary);
}

.clear-btn {
  background: color-mix(in srgb, var(--danger, #e55) 12%, var(--surface-soft) 88%);
  color: var(--danger, #e55);
}

.back-btn {
  background: var(--surface-soft);
  font-size: 18px;
}

.eq-btn {
  background: color-mix(in srgb, var(--ok, #4c8) 16%, var(--surface-soft) 84%);
  color: var(--ok, #4c8);
}

.confirm-btn {
  grid-column: span 2;
  font-size: 16px;
}

.mini-btn {
  padding: 8px 12px;
  font-size: 13px;
}
</style>
