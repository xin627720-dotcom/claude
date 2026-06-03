# OTA 固件投放目录（B 路线）

把编译好的 ESP-IDF 应用 `.bin` 放到这里，然后在聊天框输入 `/ota <文件名>`，设备就会从
`PUBLIC_URL/firmware/<文件名>` 下载并重启进入。例：

```
/ota mario-native.bin
```

`.bin` 不纳入版本库（见 .gitignore）。完整流程见 [`../../docs/APPS.md`](../../docs/APPS.md)。
