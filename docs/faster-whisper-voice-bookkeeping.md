# StrawMoneyBook faster-whisper 語音記帳方案

## 最終推薦方案

主方案採用「Vue 3 + Capacitor 前端錄音，上傳到 Node 後端，再由自架 Python `faster-whisper` 服務做 STT，最後回到 Node 後端做財務語意解析」。

- 前端只做錄音、停止、取消、重錄、上傳與缺件補單 UI。
- Node 後端只接受短音訊、做 rate limit、timeout、轉發 STT、台灣繁中正規化與財務意圖解析。
- Python STT 服務專責 `faster-whisper` 模型載入、模型快取、逐段轉錄與 GPU / CPU 配置。
- 所有缺欄位都回傳補件代碼：
  - `p1` 金額不足
  - `p2` 帳戶不足
  - `p0` 分類待選
  - `p3` 附加項目 / 對象不足

### 主方案優點

- 免費、可離線自架，不綁雲端 STT 計價。
- `large-v3 + cuda + float16` 可做正式上線等級辨識。
- 沒有 GPU 時可直接降階成 `medium/small + cpu + int8`。
- 語音與財務解析切成兩層服務，之後可無痛擴充 iOS、Email 匯入、批次票據 OCR、匿名帳號升級後雲同步。

### 備案

備案是把語意解析也搬到 Python 服務，但目前不採用。

- 優點：STT 與 NLP 放同語言可減少服務往返。
- 缺點：StrawMoneyBook 既有財務解析邏輯在 JavaScript，直接沿用 Node parser 可降低重寫成本與回歸風險。

## 已落地的專案結構

```text
backend/
  src/
    routes/speech.js
    speech/
      ai-bookkeeping-parser.js
      ai-bookkeeping-tiny-ner.service.js
      financial-parser.js
      tw-normalization.js
  test/
    speech-financial-parser.test.js

frontend/
  src/
    services/shared-ledger/backend.js
    ui/composables/use-audio-recorder.js
    ui/views/AiAutoBookkeepingPage.vue

speech-stt-service/
  app/
    config.py
    main.py
    transcriber.py
  Dockerfile.cpu
  Dockerfile.gpu
  docker-compose.yml
  requirements.txt
  .env.example
```

## 後端 API 設計

### `POST /api/speech/transcribe`

用途：上傳錄音並取得逐段轉錄、正規化文字與財務解析結果。

Request:

- `Content-Type: multipart/form-data`
- field `audio`: 錄音檔
- field `context`: JSON 字串
- field `language`: `zh` 或 `en`
- field `source`: 預設 `ai_bookkeeping`

前端送出的 `context` 建議包含：

- `accounts`
- `expenseCategories`
- `incomeCategories`
- `counterparties`
- `historyTransactions`
- `autoFillRules`
- `addonTemplates`
- `locale`
- `timezone`

Response 範例：

```json
{
  "transcript": {
    "text": "昨天早餐250用現金",
    "language": "zh",
    "languageProbability": 0.98,
    "durationMs": 5100,
    "avgLogProb": -0.18,
    "noSpeechProb": 0.01,
    "segments": [
      { "id": 0, "start": 0, "end": 2400, "text": "昨天早餐", "avg_logprob": -0.12, "no_speech_prob": 0.01 },
      { "id": 1, "start": 2400, "end": 5100, "text": "250用現金", "avg_logprob": -0.24, "no_speech_prob": 0.02 }
    ],
    "normalizationApplied": ["早餐", "國泰"],
    "normalizedText": "昨天早餐250用現金"
  },
  "parse": {
    "draft": {
      "type": "expense",
      "amountMinor": 25000,
      "accountId": "acc_cash",
      "categoryId": "cat_breakfast",
      "occurredAt": "2026-03-14T07:31:00.000Z",
      "note": ""
    },
    "warnings": [],
    "warningKeys": [],
    "actionType": "expense",
    "needsConfirmation": false,
    "missingRequirements": [],
    "suggestionOptions": {
      "accounts": [],
      "categories": [],
      "addonTemplates": []
    },
    "normalizedText": "昨天早餐250用現金",
    "normalizationApplied": ["早餐"]
  }
}
```

### `GET /api/speech/health`

用途：檢查 Node 語音路由與 Python STT 服務是否連得上。

## 錄音格式建議

首選：

- `audio/webm;codecs=opus`

備援：

- `audio/webm`
- `audio/mp4`
- `audio/aac`

原因：

- `MediaRecorder` 在 Web / Android WebView 最常見的是 `webm/opus`
- `faster-whisper` 可透過 PyAV 直接解碼，不需要依賴付費服務或外部 SDK
- 檔案比 PCM / WAV 小很多，對行動網路和 API body limit 較友善

建議錄音限制：

- 單次 5 到 30 秒最佳
- 上限先抓 75 秒
- 後端 `SPEECH_MAX_AUDIO_BYTES` 先抓 10MB

## 台灣繁中詞庫與正規化

目前已內建在 [tw-normalization.js](/mnt/data/code/project/StrawCoding/StrawMoneyBook/backend/src/speech/tw-normalization.js)：

- 支付工具別名：
  - 台灣Pay
  - 悠遊付
  - 悠遊卡
  - iPASS Money
  - 現金
  - 信用卡
- 銀行別名：
  - 國泰
  - 玉山
  - 中信
  - 台新
  - 郵局
  - 台銀
- 類別口語詞：
  - 早餐
  - 午餐
  - 晚餐
  - 飲料
  - 交通
  - 生活用品
  - 轉帳
  - 提款
  - 報銷
- 相對日期：
  - 今天
  - 昨天
  - 前天
  - 這週
  - 上週
- 口語金額：
  - `兩百五` → `250`
  - `一千二` → `1200`
  - `三萬五` → `35000`

後續擴充方式：

- 直接在 `TAIWAN_ALIAS_RULES` 加 alias
- 直接在 `RELATIVE_DATE_RULES` 加日期口語
- 直接在 `ADDON_EXPECTATION_PATTERNS` 加附加費語意

## 財務語意解析設計

解析入口在 [financial-parser.js](/mnt/data/code/project/StrawCoding/StrawMoneyBook/backend/src/speech/financial-parser.js)。

支援的 action type：

- `income`
- `expense`
- `transfer`
- `borrow`
- `lend`
- `reimbursement`
- `new_category`
- `query_analysis`
- `adjustment`

解析欄位：

- 動作類型
- 金額
- 帳戶
- 分類
- 日期
- 備註
- 商家 / 對象 / 附加標籤
- 轉入 / 轉出帳戶
- 附加項目

缺件機制：

- `p1` 金額不足
- `p2` 帳戶不足
- `p0` 分類待選
- `p3` 附加項目 / 借貸對象 / 補充說明不足

## 前端整合方式

### 錄音

錄音 composable 在 [use-audio-recorder.js](/mnt/data/code/project/StrawCoding/StrawMoneyBook/frontend/src/ui/composables/use-audio-recorder.js)。

- 使用 `getUserMedia + MediaRecorder`
- 支援開始、停止、取消、重錄
- 自動回收 mic stream
- 不把 STT 邏輯塞進前端

### UI

整合頁面在 [AiAutoBookkeepingPage.vue](/mnt/data/code/project/StrawCoding/StrawMoneyBook/frontend/src/ui/views/AiAutoBookkeepingPage.vue)。

新增能力：

- 錄音中狀態
- 語音辨識中狀態
- 重錄 / 取消錄音
- 缺件 chips
- 帳戶快速補件
- 分類快速補件
- 附加項目快速補件
- 對象 / 商家補充欄位

### API Client

上傳 helper 在 [backend.js](/mnt/data/code/project/StrawCoding/StrawMoneyBook/frontend/src/services/shared-ledger/backend.js)：

- `transcribeBookkeepingSpeech({ audioBlob, fileName, context, language, source })`

## Python 依賴清單

在 [requirements.txt](/mnt/data/code/project/StrawCoding/StrawMoneyBook/speech-stt-service/requirements.txt)：

- `fastapi`
- `uvicorn[standard]`
- `python-multipart`
- `faster-whisper`
- `pydantic-settings`

## Docker 部署方案

### CPU 版

```bash
cd speech-stt-service
cp .env.example .env
docker compose up --build -d
```

### GPU 版

```bash
cd speech-stt-service
cp .env.example .env
docker build -f Dockerfile.gpu -t strawmb-speech-stt:gpu .
docker run --rm -p 8001:8001 \
  --gpus all \
  --env-file .env \
  -v "$(pwd)/models:/models" \
  strawmb-speech-stt:gpu
```

模型快取：

- volume / host path：`speech-stt-service/models`
- env：`FASTER_WHISPER_DOWNLOAD_ROOT=/models`

## GPU / CPU 雙版本配置

### 正式環境 GPU

- `FASTER_WHISPER_MODEL_SIZE=large-v3`
- `FASTER_WHISPER_DEVICE=cuda`
- `FASTER_WHISPER_COMPUTE_TYPE=float16`

### 本機或低規機 CPU

- `FASTER_WHISPER_MODEL_SIZE=medium` 或 `small`
- `FASTER_WHISPER_DEVICE=cpu`
- `FASTER_WHISPER_COMPUTE_TYPE=int8`

## 環境變數清單

### Node backend

在 [backend/.env.example](/mnt/data/code/project/StrawCoding/StrawMoneyBook/backend/.env.example)：

- `SPEECH_STT_SERVICE_URL`
- `SPEECH_STT_SHARED_SECRET`
- `SPEECH_TRANSCRIBE_TIMEOUT_MS`
- `SPEECH_MAX_AUDIO_BYTES`
- `SPEECH_RATE_LIMIT_WINDOW_MS`
- `SPEECH_RATE_LIMIT_MAX_REQUESTS`

### Python STT service

在 [speech-stt-service/.env.example](/mnt/data/code/project/StrawCoding/StrawMoneyBook/speech-stt-service/.env.example)：

- `FASTER_WHISPER_MODEL_SIZE`
- `FASTER_WHISPER_DEVICE`
- `FASTER_WHISPER_COMPUTE_TYPE`
- `FASTER_WHISPER_DOWNLOAD_ROOT`
- `FASTER_WHISPER_CPU_THREADS`
- `FASTER_WHISPER_NUM_WORKERS`
- `FASTER_WHISPER_BEAM_SIZE`
- `FASTER_WHISPER_BEST_OF`
- `FASTER_WHISPER_LANGUAGE`
- `FASTER_WHISPER_VAD_FILTER`
- `FASTER_WHISPER_VAD_MIN_SILENCE_MS`
- `FASTER_WHISPER_CONDITION_ON_PREVIOUS_TEXT`
- `FASTER_WHISPER_WORD_TIMESTAMPS`
- `FASTER_WHISPER_TEMPERATURE`
- `STT_PORT`
- `STT_API_KEY`

## 本機開發步驟

1. 啟動 Python STT 服務

```bash
cd speech-stt-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

2. 啟動 Node backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

3. 啟動前端

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

4. 設定前端 API base

```env
VITE_SHARED_LEDGER_API_BASE_URL=http://127.0.0.1:8787
```

## 測試案例清單

### 單元測試

已實作：

- [speech-financial-parser.test.js](/mnt/data/code/project/StrawCoding/StrawMoneyBook/backend/test/speech-financial-parser.test.js)
- alias / 金額正規化
- 完整支出解析
- 缺金額 `p1`
- 借貸對象缺失 `p3`
- 查詢分析意圖

### 建議補的 API 測試

- `POST /api/speech/transcribe` 成功上傳 `webm`
- STT service timeout
- multipart 缺 `audio`
- `context` JSON 壞掉
- 超過 `SPEECH_MAX_AUDIO_BYTES`
- Python STT 服務 502 / 503

### 建議補的 E2E

- Web 錄音 5 秒 -> 顯示 transcript -> 補分類 -> 儲存成功
- Android WebView 錄音 -> 上傳 -> 可補帳戶 / 補件
- 借貸語音缺對象 -> `p3` 補件 -> 儲存成功
- 查詢分析語音 -> 不入帳，只顯示提示

## 資安與穩定性檢查清單

- 前端不直接調用任何第三方付費 STT API
- 後端對 `/api/speech/*` 有獨立 rate limit
- 後端限制 body size 與單檔音訊大小
- Node 呼叫 Python STT 有 timeout
- Node 與 Python 可用 `SPEECH_STT_SHARED_SECRET / STT_API_KEY` 保護內部服務
- 所有缺件欄位都要求使用者確認，不直接入帳
- transcript 先做正規化，降低同音字與口語數字誤判
- `multipart/form-data` 只接受單一音訊檔
- 錄音檔不落地在 Node backend
- Python 只用暫存檔處理，轉錄完即刪除

## 上線前檢查清單

- GPU 主機已安裝對應 NVIDIA Driver
- Docker GPU runtime 可用 `--gpus all`
- `large-v3` 模型第一次下載完成
- `SPEECH_STT_SERVICE_URL` 指向內網或私網服務
- `SPEECH_STT_SHARED_SECRET` / `STT_API_KEY` 已設定
- 反向代理 body size 大於 `SPEECH_MAX_AUDIO_BYTES`
- HTTPS 正常，行動網路下可上傳 `webm`
- Android WebView 實機確認 `MediaRecorder` 可錄音
- 有監控：
  - Node `/api/speech/health`
  - Python `/health`
  - timeout / 5xx / rate limit 次數

## 驗收清單

- 前端可以錄音、停止、取消、重錄
- 錄音後會上傳到後端，不再使用瀏覽器原生 STT
- 後端會回逐段 transcript 與整體文字
- 後端會做台灣繁中正規化
- 後端會做財務語意解析
- 缺欄位時會回 `p0/p1/p2/p3`
- 前端可在同頁補分類、補帳戶、補附加說明
- CPU 模式可在本機啟動
- GPU 模式可切到 `large-v3 + float16`

## 官方參考

- faster-whisper 官方專案：https://github.com/SYSTRAN/faster-whisper
- MediaRecorder MDN：https://developer.mozilla.org/docs/Web/API/MediaRecorder
