// OTA：从 URL 下载固件、写入另一 OTA 分区并重启进入（B 路线·原生应用）。
#pragma once

void ota_start(const char *url); // 异步：下载并重启进入新固件
void ota_mark_valid(void);        // 启动正常后取消回滚，标记当前固件有效
