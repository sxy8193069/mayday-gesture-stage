# 第三方组件说明

## Three.js r170

- 用途：三维渲染、模型与粒子。
- 上游：<https://github.com/mrdoob/three.js/tree/r170>
- 许可：MIT。
- 分发文件：`vendor/three.module.js`。
- 许可证原文：`vendor/THREE-LICENSE.txt`。

## mp4-muxer 5.2.2

- 用途：在支持 WebCodecs 的浏览器中封装 MP4。
- 上游：<https://github.com/Vanilagy/mp4-muxer>
- 许可：MIT。
- 分发文件：`vendor/mp4-muxer.js`，文件头保留完整许可与版权声明。

## MediaPipe Tasks Vision 0.10.32

- 用途：手部关键点识别。
- 上游：<https://github.com/google-ai-edge/mediapipe>
- 许可：Apache-2.0，以对应上游发布版本为准。
- 浏览器在开启摄像头交互时，从 jsDelivr 下载组件及 WebAssembly 文件，从 Google Storage 下载 Hand Landmarker 模型。仓库没有重新分发这些组件或模型。
- 加载地址可在 `src/runtime.js` 的 `createHandTracker` 中查看。

## 自行添加的素材

本仓库不分发原演出主屏照片、音乐、演出录像或参考照片。项目的 MIT 代码许可不覆盖乐队名称、商标、人物形象以及用户自行加入的第三方素材。
