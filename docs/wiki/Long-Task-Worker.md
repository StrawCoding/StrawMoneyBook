# 長任務 Worker

## 目的

StrawMoneyBook 新任務走 Hermes generic long-task，**不使用 Plane**。

## 指令

```bash
python3 ~/.hermes/scripts/hermes_task_worker.py <cmd> <project>
# project = strawmoneybook
# cmd: watch | status | goto | cli | attach | attach-cli | inject | poke | steer
#      trigger-verify | pause | unpause | stop | logs | mark
```

捷徑：`ltask-cli strawmoneybook` / `ltask <cmd> …`

## 硬規則

1. 碰共享 repo（build／commit／改 ISO 無關但含本 repo 建置）前先 `watch strawmoneybook` + `tmux ls`。
2. worker 活躍時不要同時在同一工作區 build／改產品碼。先 `pause`。
3. worker **禁止** `gpr`、改 version、tag。
4. FAIL 時對 worker 只給 log，不給技術方向。連續 FAIL >10 次問使用者。
5. 完成後 OpenCode 驗收 APPROVE 才 mark PASS；再由 Hermes 做 no-Plane closeout。

## 與本 Wiki 的關係

Worker prompt 應指向：

- [Closeout-And-Versioning](Closeout-And-Versioning)
- [Playwright-App-Shell](Playwright-App-Shell)
- [Backend-Deployment-And-Health](Backend-Deployment-And-Health)
- [Android-Native-Bank-APK](Android-Native-Bank-APK)

## 引用

- skill `strawmb`、`user-coding-rules`
- [Optimization-Plan](Optimization-Plan)
