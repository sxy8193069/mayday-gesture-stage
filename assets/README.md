# 更换舞台主屏

默认主屏由 `src/stage-art.mjs` 绘制，不依赖外部照片。

如需使用自己的图片：

1. 将具有使用权限的图片放入本目录，例如 `stage-screen.png`。
2. 打开 `src/stage-art.mjs`，将 `const customStageScreen=null;` 改为：

```js
const customStageScreen='../assets/stage-screen.png';
```

3. 保存并刷新浏览器。主屏贴图为 2304 × 720，建议按约 3.2:1 的比例准备图片，避免拉伸。

填写了图片路径但文件不存在时，页面会提示加载失败，请检查文件名和路径。默认忽略 `stage-screen.*` 的 Git 跟踪，避免误上传个人素材；确需公开时，请先确认素材权限，再明确加入版本管理。
