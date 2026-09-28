# 第三方组件与模型来源

## MediaPipe Tasks Vision

固定版本：`@mediapipe/tasks-vision@0.10.32`。

运行文件来自 https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/ 。包元数据声明 Apache-2.0；完整许可文本保留于 `assets/mediapipe/LICENSE`。

## 模型

以下公开模型以原始文件随本地体验包提供，版本固定为 float16/1。使用限制与说明以发布方资料为准，项目自身的评估用途声明不覆盖第三方权利。

- [Face Landmarker 模型与说明](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker)。文件：https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
- [Pose Landmarker 模型与说明](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker)。文件：https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
- [Hand Landmarker 模型与说明](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker)。文件：https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task

模型用于关键点和表情系数估计，不提供人物身份识别，也不等同于自然度、美学或大屏语义分类模型。后续正式公开仓库前需保留此来源与完整组件许可，并核对模型的再分发条款；必要时改为从官方地址下载模型的安装步骤。
