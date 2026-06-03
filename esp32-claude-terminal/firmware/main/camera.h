// 摄像头：OV3660 采集，按需抓一帧 JPEG 上传给桥接（转交 Claude 识别）。
// 关闭 CONFIG_APP_ENABLE_CAMERA 时为空实现。
#pragma once

void camera_init(void);
void camera_request_capture(void); // 异步请求抓一帧并上传
