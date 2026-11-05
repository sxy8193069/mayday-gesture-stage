'use strict';
const $ = selector => document.querySelector(selector);
const canvas = $('#garden'), ctx = canvas.getContext('2d', { alpha: false });
const video = $('#camera'), overlay = $('#hand-overlay'), handCtx = overlay.getContext('2d');
const toggle = $('#camera-toggle'), buttonLabel = $('#camera-button-label'), status = $('#camera-status');
const preview = $('#preview'), mode = $('#mode'), modeLabel = $('#mode-label');
const switchBadge = $('#switch-hand'), bloomBadge = $('#bloom-hand');
const recordCanvas = $('#record-stage'), recordCtx = recordCanvas.getContext('2d', { alpha: false });
const recordStart = $('#record-start'), recordStop = $('#record-stop'), recordCountdown = $('#record-countdown');
const recordTime = $('#record-time'), recordStatus = $('#record-status'), recordPlayer = $('#record-playback'), recordDownload = $('#record-download');
const experienceView = $('#experience-view'), recordingView = $('#recording-view');
const controller = MaydayCore.createController(), gestureGate = MaydayCore.createGestureGate(controller);
const pointerTracker=MaydayCore.createPointerTracker();
const scene = new MaydayScene(matchMedia('(prefers-reduced-motion: reduce)').matches);
let width = 0, height = 0, currentView = 'experience', recordState = 'idle', countdownTimer = null;
let activeRecording = null, recordingUrl = null, recordNotice = null, directRecordingConfig = null;
let stream = null, landmarker = null, cameraState = 'off', cameraSession = 0;
let lastVideoTime = -1, lastInference = 0, inferenceBusy = false;
let roles = null, handRoles = null, visibleHands = [], lastFrame = 0;
let leftPose = null, rightPose = null, rightPointerRecord=null;
let sceneFailed = false;
function failScene(message) {
  sceneFailed = true; stopCamera(); setStatus(message, true);
  for (const id of ['gather','scatter','stage-button','celebrate','reset','motion-toggle','camera-toggle']) $('#'+id).disabled = true;
}
window.addEventListener('mayday-renderer-lost', () => failScene('三维画面连接已中断，已停止录制。请刷新页面重新加载。'));
window.addEventListener('error', event => { if (/WebGL|三维|渲染/.test(event.message)) failScene('三维渲染发生错误，请刷新后重新尝试。'); });

function setStatus(message, isError = false) { status.textContent = message; status.dataset.error = String(isError); }

function syncSceneUI() {
  const s = controller.state, member = MaydayCore.members[s.index];
  $('#gather').disabled = s.mode !== 'stars';
  $('#scatter').disabled = s.mode === 'stars';
  $('#stage-button').disabled = s.mode === 'stage';
  $('#celebrate').disabled = s.mode !== 'stage';
  $('#gather').textContent = s.nextIndex === 0 ? '凝聚一颗星球' : '凝聚下一颗星球';
  $('#scene-phase').textContent = s.mode === 'stage' ? '03 / 舞台亮起' : s.mode === 'ball' ? '02 / 星光凝聚' : '01 / 五迷星空 LIVE';
  $('#scene-title').textContent = s.mode === 'stage' ? '我们在一起，才是五月天。' : s.mode === 'ball' ? member.role + ' · ' + member.name + ' · ' + ['赤红星球', '金黄星球', '粉色星球', '蓝色星球', '绿色星球'][s.index] : '把星光，握成一场相遇。';
  $('#scene-hint').textContent = s.mode === 'stage' ? '右手比 2 再落彩带，轻移带动蓝色应援；左手先握拳，再张开散回星空。' : s.mode === 'ball' ? '轻移右手，星球随你转眸；停住片刻，收到回应。左手张开散回星空。' : '张开左手轻移，带起星光涟漪；握拳凝聚星球，右手 OK 点亮舞台。';
  $('#scene-count').textContent = s.mode === 'stage' ? '05 / 05' : String(s.index + 1).padStart(2, '0') + ' / 05';
  canvas.setAttribute('aria-label', s.mode === 'stage' ? '五颗表情球、五位成员与 5525 三维微缩舞台' : s.mode === 'ball' ? member.name + '的三维表情球' : '五色星光散落的夜空');
  document.querySelectorAll('.member-rail span').forEach((e, i) => { e.dataset.active = String(s.mode === 'stage' || s.mode === 'ball' && s.index === i); });
}

function act(action) {
  if (sceneFailed) return;
  if (action === 'reset') gestureGate.reset();
  if (controller.dispatch(action)) syncSceneUI();
}

function setView(view) {
  if (recordState !== 'idle') return;
  currentView = view; document.body.dataset.view = view;
  experienceView.setAttribute('aria-pressed', String(view === 'experience'));
  recordingView.setAttribute('aria-pressed', String(view === 'recording'));
  $(view === 'recording' ? '#record-camera-home' : '#camera-home').appendChild($('#camera-panel'));
  $(view === 'recording' ? '#record-manual-home' : '#manual-home').appendChild($('#manual-panel'));
  if (view === 'recording') $('#record-camera-actions').appendChild(toggle);
  else $('#camera-panel').insertBefore(toggle, status);
  if (view === 'recording') paintRecording();
  else resize();
  updateRecordingUI();
}

function resize() {
  const bounds = canvas.getBoundingClientRect(), ratio = Math.min(devicePixelRatio || 1, 1.4);
  width = Math.round(bounds.width * ratio); height = Math.round(bounds.height * ratio);
  if (width && height && (canvas.width !== width || canvas.height !== height)) { canvas.width = width; canvas.height = height; }
}

function paintRecording() {
  const now = performance.now();
  recordCtx.save(); recordCtx.beginPath(); recordCtx.rect(0, 0, 1200, 900); recordCtx.clip();
  scene.render(recordCtx, 1200, 900, controller.state, now);
  recordCtx.restore(); recordCtx.save(); recordCtx.scale(1200 / 1080, 1500 / 1350);
  recordCtx.fillStyle = '#07101e'; recordCtx.fillRect(0, 810, 1080, 540);
  const ready = video.readyState >= 2 && video.videoWidth > 0 && Boolean(stream);
  $('#record-empty').hidden = ready;
  if (ready) {
    const ratio = Math.max(1080 / video.videoWidth, 540 / video.videoHeight);
    const w = video.videoWidth * ratio, h = video.videoHeight * ratio;
    const x = (1080 - w) / 2, y = 810 + (540 - h) / 2;
    recordCtx.save(); recordCtx.beginPath(); recordCtx.rect(0, 810, 1080, 540); recordCtx.clip();
    recordCtx.translate(1080, 0); recordCtx.scale(-1, 1); recordCtx.drawImage(video, x, y, w, h);
    recordCtx.translate(x, y); recordCtx.scale(ratio, ratio);
    paintHandSkeleton(recordCtx, visibleHands, video.videoWidth, video.videoHeight, true);
    recordCtx.restore();
  }
  paintRecordingText(); recordCtx.restore();
  if (recordState === 'recording') submitRecordingFrame(activeRecording);
}

function paintRecordingText() {
  const s = controller.state, member = MaydayCore.members[s.index];
  recordCtx.save(); recordCtx.textAlign = 'left'; recordCtx.textBaseline = 'alphabetic';
  recordCtx.font = '22px "Microsoft YaHei", sans-serif'; recordCtx.fillStyle = '#c5d2eb'; recordCtx.fillText('MAYDAY / 5525', 30, 43);
  recordCtx.textAlign = 'right'; recordCtx.font = '20px "Microsoft YaHei", sans-serif';
  recordCtx.fillStyle = member && s.mode === 'ball' ? member.color : '#bfcee9';
  recordCtx.fillText(s.mode === 'stage' ? '我们在一起，才是五月天。' : s.mode === 'ball' ? member.role + ' · ' + member.name : '五迷星空 LIVE', 1050, 43);
  recordCtx.textAlign = 'left'; recordCtx.font = '18px "Microsoft YaHei", sans-serif'; recordCtx.fillStyle = '#9babc6';
  recordCtx.fillText(s.mode === 'stage' ? '右手比 2 落彩带 · 轻移带动应援 · 左手先握拳再张开退出' : s.mode === 'ball' ? '轻移右手，星球随你转眸 · 停手片刻，收到回应 · 左手张开散回星空' : '张手轻移，带起星光涟漪 · 握拳聚合 · 右手 OK 舞台', 30, 785);
  recordCtx.textAlign = 'right'; recordCtx.fillText(s.mode === 'stage' ? '05 / 05' : String(s.index + 1).padStart(2, '0') + ' / 05', 1050, 785);
  const band=recordCtx.createLinearGradient(0,810,0,902);
  band.addColorStop(0,'#07101edb');band.addColorStop(.6,'#07101e85');band.addColorStop(1,'#07101e00');
  recordCtx.fillStyle=band;recordCtx.fillRect(0,810,1080,92);
  paintBrandMark(recordCtx,34,828);
  recordCtx.font='26px "Microsoft YaHei", sans-serif';recordCtx.textAlign='left';recordCtx.fillStyle='#eef3ff';
  recordCtx.fillText('把星光，握成一场相遇。',102,854);
  recordCtx.font='17px "Microsoft YaHei", sans-serif';recordCtx.textAlign='right';
  const rightText='右手 · '+(rightPose==='ok'?'OK':rightPose==='two'?'比 2':rightPose?'已识别':rightPointerRecord?'跟随中':'等待入镜');
  recordCtx.fillStyle='#f0bbd7';recordCtx.fillText(rightText,1050,850);
  const rightWidth=recordCtx.measureText(rightText).width;
  recordCtx.fillStyle='#a4e6d6';recordCtx.fillText('左手 · '+(leftPose==='fist'?'握拳':leftPose==='open'?'张开':'等待入镜'),1050-rightWidth-30,850);
  recordCtx.restore();
}

function paintBrandMark(context,x,y){
  const colors=['#ff493f','#ffdc3e','#ff74b8','#27c7ed','#3be270'];
  colors.forEach((color,i)=>{
    context.save();context.translate(x+i*10+2.5,y+(i%2?5:0)+15);context.rotate(Math.PI/10);
    context.fillStyle=color;context.fillRect(-2.5,-15,5,30);context.restore();
  });
}

function applyHandResults(result, now) {
  try {
    const detected = result.landmarks.map((points, i) => ({ points, label: result.handedness[i]?.[0]?.categoryName, confidence: result.handedness[i]?.[0]?.score || 0 }));
    const matched = MaydayCore.assignRoles(detected, roles); roles = matched.roles;
    rightPointerRecord=pointerTracker.update(detected,matched,now);
    handRoles = roles ? { switch: roles.left, bloom: roles.right } : null;
    const aspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 4 / 3;
    leftPose = matched.left ? MaydayCore.classifyHand(matched.left.points, aspect)?.left : null;
    rightPose = matched.right ? MaydayCore.classifyHand(matched.right.points, aspect)?.right : null;
    const palmPosition=hand=>{
      if(!hand)return null;
      const points=[0,5,9,13,17].map(i=>hand.points[i]);
      return {x:1-2*points.reduce((sum,p)=>sum+p.x,0)/5,y:1-2*points.reduce((sum,p)=>sum+p.y,0)/5};
    };
    scene.setHandInput({left:matched.left?{...palmPosition(matched.left),open:leftPose==='open'}:null,right:palmPosition(rightPointerRecord)},now);
    const event = gestureGate.update(leftPose, rightPose, now);
    if (event === 'celebrate') scene.celebrate();
    if (event) syncSceneUI();
    switchBadge.dataset.tracked = String(Boolean(matched.left)); bloomBadge.dataset.tracked = String(Boolean(rightPointerRecord));
    switchBadge.textContent = '左手 · ' + (leftPose === 'fist' ? '握拳聚合' : leftPose === 'open' ? '张手散开' : '凝聚 / 散开');
    bloomBadge.textContent = '右手 · ' + (rightPose === 'ok' ? 'OK 已识别' : rightPose === 'two' ? '2 已识别' : rightPointerRecord ? (controller.state.mode === 'stage' ? '跟随中 · 2 彩带' : '跟随中 · OK 舞台') : '等待入镜');
    modeLabel.textContent = !roles ? '等待双手分工' : matched.left && matched.right ? '双手协作中' : matched.left || matched.right ? '单手已识别' : '等待双手';
    if (!roles) setStatus('请先让双手分开入镜：镜像左侧为左手，右侧为右手。');
    else setStatus(controller.state.mode === 'stage' ? '舞台已点亮。右手比 2 落彩带；左手先握拳，再张开散回星空。' : '左手握拳聚合、张开散回；右手 OK 时请伸展其余三指。');
    drawHands([matched.left, rightPointerRecord].filter(Boolean));
  } catch {
    stopCamera(); setStatus('手势识别已中断，请重新开启。仍可用按钮体验。', true);
  }
}

function stopCamera() {
  stopRecording('摄像头已关闭，本次录制已结束。');
  cameraSession++; cameraState = 'off'; stream?.getTracks().forEach(track => track.stop()); stream = null;
  video.srcObject = null; landmarker?.close(); landmarker = null; inferenceBusy = false;
  roles = null; handRoles = null; leftPose = null; rightPose = null; rightPointerRecord=null;gestureGate.reset();pointerTracker.reset();
  scene.setHandInput(null);
  preview.dataset.active = 'false'; toggle.dataset.active = 'false'; toggle.setAttribute('aria-pressed', 'false');
  buttonLabel.textContent = '开启双手互动'; mode.dataset.camera = 'false'; modeLabel.textContent = '自由体验';
  switchBadge.dataset.tracked = 'false'; bloomBadge.dataset.tracked = 'false';
  switchBadge.textContent = '左手 · 凝聚 / 散开'; bloomBadge.textContent = '右手 · OK 舞台 / 2 彩带';
  drawHands([]); setStatus('摄像头已关闭，当前画面保留，可继续用按钮操作。'); updateRecordingUI();
}

// 复用原项目的本地识别、骨架和视频封装实现，构建时内嵌到独立页面。
    function recordingFormat() {
      if (directRecordingConfig) return { mime: 'video/mp4', extension: 'mp4', engine: 'webcodecs' };
      if (typeof MediaRecorder === 'undefined' || typeof recordCanvas.captureStream !== 'function') return null;
      for (const mime of ['video/mp4;codecs=avc1.420028', 'video/mp4', 'video/webm;codecs=vp8', 'video/webm']) {
        if (MediaRecorder.isTypeSupported(mime)) return { mime, extension: mime.startsWith('video/mp4') ? 'mp4' : 'webm', engine: 'mediarecorder' };
      }
      return null;
    }

    async function prepareRecordingEncoder() {
      if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined' || typeof Mp4Muxer === 'undefined') return;
      try {
        const support = await VideoEncoder.isConfigSupported({
          codec: 'avc1.420028', width: 1200, height: 1500, bitrate: 20000000, framerate: 30,
          latencyMode: 'realtime', hardwareAcceleration: 'prefer-software', avc: { format: 'avc' }
        });
        if (support.supported) directRecordingConfig = support.config;
      } catch { /* 浏览器不支持此配置时使用其原生录制接口。 */ }
      updateRecordingUI();
    }

    function failRecording(session) {
      if (activeRecording !== session) return;
      session.failed = true;
      stopRecording('录制失败，请重试或换用新版 Chrome / Edge。');
    }

    function submitRecordingFrame(session) {
      if (!session.encoder) { session.frameTrack.requestFrame(); return; }
      if (session.encoder.state !== 'configured' || session.encoder.encodeQueueSize >= 3) return;
      let frame;
      try {
        const timestamp = Math.round((performance.now() - session.startedAt) * 1000);
        frame = new VideoFrame(recordCanvas, { timestamp, duration: 33333 });
        const keyFrame = timestamp >= session.nextKeyFrameAt;
        session.encoder.encode(frame, { keyFrame });
        if (keyFrame) session.nextKeyFrameAt = timestamp + 2000000;
      } catch { failRecording(session); }
      finally { frame?.close(); }
    }

    async function finishDirectRecording(session) {
      try {
        if (!session.failed) {
          await session.encoder.flush();
          if (!session.failed) {
            session.muxer.finalize();
            session.chunks.push(new Blob([session.target.buffer], { type: session.format.mime }));
          }
        }
      } catch { session.failed = true; }
      finally {
        if (session.encoder.state !== 'closed') session.encoder.close();
        session.muxer = null;
        session.target = null;
        finishRecording(session);
      }
    }

    function formatTime(milliseconds) {
      const seconds = Math.floor(milliseconds / 1000);
      return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
    }

    function updateRecordingUI() {
      const format = recordingFormat(), busy = recordState !== 'idle';
      recordCanvas.dataset.state = recordState;
      recordStart.disabled = busy || cameraState !== 'on' || !format;
      recordStop.hidden = !['countdown', 'recording'].includes(recordState);
      recordStop.textContent = recordState === 'countdown' ? '取消' : '停止';
      recordCountdown.hidden = recordState !== 'countdown';
      experienceView.disabled = busy;
      recordingView.disabled = busy;
      document.querySelector('#record-format').textContent = format ? format.extension.toUpperCase() + ' · 无声' : '录制不可用';
      const defaultMessage = !format ? '当前浏览器不支持视频录制，请用新版 Chrome 或 Edge 打开。' : cameraState === 'on' ? '构图就绪，开始后有 3 秒准备时间。' : '先开启摄像头，再开始录制。';
      recordStatus.textContent = recordNotice?.message || defaultMessage;
      recordStatus.dataset.error = String(recordNotice?.isError || !format);
    }

    function startRecording() {
      if (recordState !== 'idle') return;
      if (!recordingFormat() || cameraState !== 'on' || !stream?.active || video.readyState < 2) {
        recordNotice = { message: '请等待摄像头和手势互动准备完成，再开始录制。', isError: true };
        updateRecordingUI();
        return;
      }
      recordPlayer.pause();
      recordState = 'countdown';
      recordTime.textContent = '00:00';
      recordCountdown.textContent = '3';
      recordNotice = { message: '准备录制，请让脸和双手完整入镜。' };
      updateRecordingUI();
      const deadline = performance.now() + 3000;
      countdownTimer = setInterval(() => {
        const seconds = Math.ceil((deadline - performance.now()) / 1000);
        if (seconds > 0) recordCountdown.textContent = String(seconds);
        else {
          clearInterval(countdownTimer);
          countdownTimer = null;
          beginRecording();
        }
      }, 100);
    }

    function beginRecording() {
      if (recordState !== 'countdown') return;
      if (cameraState !== 'on' || !stream?.active || document.hidden) { stopRecording('录制已取消，请保持页面和摄像头开启。'); return; }
      let captured = null, session = null;
      try {
        paintRecording();
        const format = recordingFormat();
        session = { format, chunks: [], failed: false, startedAt: performance.now(), duration: 0, message: '录制完成，可预览并下载。' };
        if (format.engine === 'webcodecs') {
          session.target = new Mp4Muxer.ArrayBufferTarget();
          session.muxer = new Mp4Muxer.Muxer({
            target: session.target, video: { codec: 'avc', width: 1200, height: 1500 },
            fastStart: 'in-memory', firstTimestampBehavior: 'offset'
          });
          session.encoder = new VideoEncoder({
            output: (chunk, metadata) => {
              if (session.failed) return;
              try { session.muxer.addVideoChunk(chunk, metadata); }
              catch { failRecording(session); }
            },
            error: () => failRecording(session)
          });
          session.encoder.configure(directRecordingConfig);
          session.nextKeyFrameAt = 0;
        } else {
          captured = recordCanvas.captureStream(0);
          session.captured = captured;
          session.frameTrack = captured.getVideoTracks()[0];
          if (typeof session.frameTrack.requestFrame !== 'function') throw new Error('manual frame capture unavailable');
          const recorder = new MediaRecorder(captured, { mimeType: format.mime, videoBitsPerSecond: 20000000 });
          session.recorder = recorder;
          recorder.ondataavailable = event => { if (event.data.size > 0) session.chunks.push(event.data); };
          recorder.onerror = () => failRecording(session);
          recorder.onstop = () => finishRecording(session);
          recorder.start(1000);
        }
        activeRecording = session;
        recordState = 'recording';
        recordNotice = { message: '正在录制，点击停止结束。' };
        paintRecording();
      } catch {
        if (captured) captured.getTracks().forEach(track => track.stop());
        if (session?.encoder && session.encoder.state !== 'closed') session.encoder.close();
        activeRecording = null;
        recordState = 'idle';
        recordNotice = { message: '无法启动视频编码，请重试或换用新版 Chrome / Edge。', isError: true };
      }
      updateRecordingUI();
    }

    function stopRecording(message = '录制完成，可预览并下载。') {
      if (recordState === 'countdown') {
        clearInterval(countdownTimer);
        countdownTimer = null;
        recordState = 'idle';
        recordNotice = { message: message === '录制完成，可预览并下载。' ? '已取消，准备好后可重新录制。' : message };
      } else if (recordState === 'recording') {
        recordState = 'finalizing';
        activeRecording.duration = performance.now() - activeRecording.startedAt;
        activeRecording.message = message;
        recordNotice = { message: '正在生成视频，请稍候。' };
        if (activeRecording.encoder) finishDirectRecording(activeRecording);
        else if (activeRecording.recorder.state !== 'inactive') activeRecording.recorder.stop();
      }
      updateRecordingUI();
    }

    function finishRecording(session) {
      session.captured?.getTracks().forEach(track => track.stop());
      if (activeRecording !== session) return;
      try {
        if (session.failed || !session.chunks.length) throw new Error('empty recording');
        const blob = new Blob(session.chunks, { type: session.recorder?.mimeType || session.format.mime });
        const nextUrl = URL.createObjectURL(blob);
        const previousUrl = recordingUrl;
        recordPlayer.pause();
        recordingUrl = nextUrl;
        recordPlayer.src = nextUrl;
        recordDownload.href = nextUrl;
        recordDownload.download = '五月天-三维星空舞台-' + new Date().toISOString().replace(/[:.]/g, '-') + '.' + session.format.extension;
        recordDownload.textContent = '下载 ' + session.format.extension.toUpperCase() + ' 视频';
        document.querySelector('#record-result-info').textContent = '1200 × 1500 · ' + (session.duration / 1000).toFixed(1) + ' 秒 · ' + (blob.size / 1024 / 1024).toFixed(1) + ' MB';
        document.querySelector('#record-result').hidden = false;
        if (previousUrl) URL.revokeObjectURL(previousUrl);
        recordNotice = { message: session.message };
      } catch {
        recordNotice = { message: '本次视频未能生成，请重新录制。', isError: true };
      }
      session.chunks.length = 0;
      activeRecording = null;
      recordState = 'idle';
      updateRecordingUI();
    }

    const handConnections = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];

    function drawHands(hands) {
      visibleHands = hands;
      handCtx.clearRect(0, 0, overlay.width, overlay.height);
      paintHandSkeleton(handCtx, hands, overlay.width, overlay.height);
    }

    function paintHandSkeleton(drawing, hands, frameWidth, frameHeight, recording = false) {
      const displayScale = recording ? Math.max(1080 / frameWidth, 540 / frameHeight) :
        Math.max(overlay.clientWidth / frameWidth, overlay.clientHeight / frameHeight) || 1;
      const unit = 1 / displayScale;
      const lineWidth = (recording ? 4 : 1.05) * unit;
      drawing.save();
      drawing.lineCap = 'round';
      drawing.lineJoin = 'round';
      for (const { points: hand, label } of hands) {
        const isBloom = handRoles?.bloom === label;
        const color = handRoles?.switch === label ? (recording ? '#acd8be' : '#8ce6d1') :
          isBloom ? (recording ? '#f6c9df' : '#efb8e1') : '#c1c5d4';
        drawing.beginPath();
        for (const [a, b] of handConnections) {
          drawing.moveTo(hand[a].x * frameWidth, hand[a].y * frameHeight);
          drawing.lineTo(hand[b].x * frameWidth, hand[b].y * frameHeight);
        }
        drawing.strokeStyle = recording ? '#07131be6' : '#07131b99';
        drawing.lineWidth = lineWidth + (recording ? 3 : .8) * unit;
        drawing.stroke();
        drawing.strokeStyle = color;
        drawing.lineWidth = lineWidth;
        drawing.stroke();
        if (isBloom) {
          drawing.beginPath(); drawing.moveTo(hand[4].x * frameWidth, hand[4].y * frameHeight);
          drawing.lineTo(hand[8].x * frameWidth, hand[8].y * frameHeight);
          if (recording) {
            drawing.strokeStyle = '#07131be6'; drawing.lineWidth = lineWidth + 3 * unit; drawing.stroke();
            drawing.strokeStyle = '#ffe3b5'; drawing.lineWidth = lineWidth; drawing.stroke();
          } else {
            drawing.setLineDash([3 * unit, 3 * unit]);
            drawing.strokeStyle = '#ffe3b5b3'; drawing.lineWidth = .8 * unit; drawing.stroke();
            drawing.setLineDash([]);
          }
        }
        for (let i = 0; i < hand.length; i++) {
          const fingertip = isBloom && (i === 4 || i === 8);
          const radius = recording ? (fingertip ? 8 : 5.5) : (fingertip ? 1.35 : 1.1);
          if (!recording && i > 0 && i % 4 === 0) {
            drawing.beginPath();
            drawing.arc(hand[i].x * frameWidth, hand[i].y * frameHeight, (fingertip ? 3.1 : 2.5) * unit, 0, Math.PI * 2);
            drawing.strokeStyle = fingertip ? '#ffe3b5' : color;
            drawing.lineWidth = .7 * unit;
            drawing.stroke();
          }
          drawing.fillStyle = fingertip ? '#ffe3b5' : color;
          drawing.beginPath();
          drawing.arc(hand[i].x * frameWidth, hand[i].y * frameHeight, radius * unit, 0, Math.PI * 2);
          drawing.strokeStyle = '#07131be6'; drawing.lineWidth = (recording ? 2 : .6) * unit; drawing.stroke();
          drawing.fill();
        }
      }
      drawing.restore();
    }

    function createHandTracker(session) {
      const source = `
        let model = null;
        self.onmessage = async ({ data }) => {
          if (data.type === 'init') {
            try {
              const { FilesetResolver, HandLandmarker } = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/vision_bundle.mjs');
              const files = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm');
              model = await HandLandmarker.createFromOptions(files, {
                baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', delegate: 'CPU' },
                runningMode: 'VIDEO', numHands: 2,
                minHandDetectionConfidence: .55, minHandPresenceConfidence: .55, minTrackingConfidence: .55
              });
              self.postMessage({ type: 'ready' });
            } catch (error) { self.postMessage({ type: 'error', message: error.message }); }
          } else if (data.type === 'frame') {
            try {
              const result = model.detectForVideo(data.image, data.timestamp);
              self.postMessage({ type: 'result', timestamp: data.timestamp, result: { landmarks: result.landmarks, handedness: result.handedness } });
            } catch (error) { self.postMessage({ type: 'error', message: error.message }); }
            finally { data.image.close(); }
          }
        };
      `;
      const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      let worker;
      try { worker = new Worker(url); }
      catch (error) { URL.revokeObjectURL(url); throw error; }
      let resolveReady, rejectReady, ready = false, closed = false;
      const loaded = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
      const fail = error => {
        if (closed || session !== cameraSession) return;
        if (!ready) rejectReady(error);
        else {
          stopCamera();
          setStatus('手势识别已中断，请重新开启；也可继续用按钮体验。', true);
        }
      };
      worker.onerror = event => { event.preventDefault(); fail(new Error(event.message)); };
      worker.onmessage = ({ data }) => {
        if (closed || session !== cameraSession) return;
        if (data.type === 'ready') {
          ready = true;
          URL.revokeObjectURL(url);
          resolveReady();
        } else if (data.type === 'result') {
          inferenceBusy = false;
          if (cameraState === 'on' && !document.hidden) applyHandResults(data.result, data.timestamp);
        } else if (data.type === 'error') fail(new Error(data.message));
      };
      worker.postMessage({ type: 'init' });
      return {
        worker, loaded,
        close() {
          if (closed) return;
          closed = true;
          worker.terminate();
          URL.revokeObjectURL(url);
          if (!ready) rejectReady(new DOMException('已取消开启', 'AbortError'));
        }
      };
    }

    async function startCamera() {
      if (!isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setStatus('当前浏览器无法访问摄像头。请用新版 Chrome 或 Edge 打开；网站需使用 HTTPS 或 localhost。', true);
        return;
      }
      const session = ++cameraSession;
      cameraState = 'loading';
      recordNotice = null;
      updateRecordingUI();
      toggle.dataset.active = 'true';
      toggle.setAttribute('aria-pressed', 'true');
      buttonLabel.textContent = '取消开启';
      setStatus('请允许浏览器使用摄像头。');
      let acquired = null;
      let phase = 'camera';
      try {
        acquired = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 }, aspectRatio: { ideal: 16 / 9 } }, audio: false });
        if (session !== cameraSession) { acquired.getTracks().forEach(track => track.stop()); return; }
        stream = acquired;
        acquired.getVideoTracks()[0].addEventListener('ended', () => {
          if (stream !== acquired) return;
          stopCamera();
          setStatus('摄像头连接已断开，请检查设备后重新开启。', true);
        });
        video.srcObject = acquired;
        await video.play();
        if (session !== cameraSession) return;
        preview.dataset.active = 'true';
        overlay.width = video.videoWidth;
        overlay.height = video.videoHeight;
        phase = 'model';
        setStatus('正在加载手势识别，首次开启可能需要稍候。');
        landmarker = createHandTracker(session);
        await landmarker.loaded;
        if (session !== cameraSession) return;
        cameraState = 'on';
        updateRecordingUI();
        lastVideoTime = -1;
        lastInference = 0;
        mode.dataset.camera = 'true';
        modeLabel.textContent = '等待双手';
        buttonLabel.textContent = '关闭摄像头';
        setStatus('请将双手分别放在镜像预览左右两侧：左手握拳聚合、张开散回，右手 OK 点亮舞台。');
      } catch (error) {
        if (acquired) acquired.getTracks().forEach(track => track.stop());
        if (session !== cameraSession) return;
        stopCamera();
        const messages = {
          NotAllowedError: '未获得摄像头权限。请在地址栏的权限设置中允许访问，再重新开启。',
          NotFoundError: '未找到摄像头。连接摄像头后可重试，也可继续用按钮体验。',
          NotReadableError: '摄像头暂时不可用，请关闭占用它的应用后重试。',
          SecurityError: '浏览器阻止了摄像头访问，请检查页面和摄像头权限。'
        };
        setStatus(phase === 'model' ? '手势识别组件加载失败，请检查网络后重试。手动按钮仍可使用。' : messages[error.name] || '摄像头未能开启，请检查设备与浏览器权限后重试。', true);
      }
    }

    function detectHand(now) {
      if (cameraState !== 'on' || !landmarker || inferenceBusy || document.hidden || video.readyState < 2 || now - lastInference < 40 || video.currentTime === lastVideoTime) return;
      lastInference = now;
      lastVideoTime = video.currentTime;
      inferenceBusy = true;
      const tracker = landmarker, session = cameraSession;
      const inputWidth = Math.min(640, video.videoWidth);
      const inputHeight = Math.round(inputWidth * video.videoHeight / video.videoWidth);
      createImageBitmap(video, { resizeWidth: inputWidth, resizeHeight: inputHeight, resizeQuality: 'low' }).then(image => {
        if (session !== cameraSession || tracker !== landmarker) { image.close(); return; }
        try { tracker.worker.postMessage({ type: 'frame', image, timestamp: now }, [image]); }
        catch (error) { image.close(); throw error; }
      }).catch(() => {
        if (session !== cameraSession) return;
        stopCamera();
        setStatus('手势图像未能处理，请重新开启摄像头。', true);
      });
    }



function render(now) {
  if (document.hidden || sceneFailed) { lastFrame = now; requestAnimationFrame(render); return; }
  if (now - lastFrame >= 1000 / 30 - 1) {
    lastFrame = now;
    if (currentView === 'recording') paintRecording();
    else if (width && height) scene.render(ctx, width, height, controller.state, now);
    if (recordState === 'recording') {
      const elapsed = now - activeRecording.startedAt; recordTime.textContent = formatTime(elapsed);
    }
  }
  detectHand(now); requestAnimationFrame(render);
}

$('#gather').addEventListener('click', () => act('gather'));
$('#scatter').addEventListener('click', () => act('scatter'));
$('#stage-button').addEventListener('click', () => act('stage'));
$('#celebrate').addEventListener('click', () => { scene.celebrate(); });
$('#reset').addEventListener('click', () => act('reset'));
toggle.addEventListener('click', () => cameraState === 'off' ? startCamera() : stopCamera());
experienceView.addEventListener('click', () => setView('experience')); recordingView.addEventListener('click', () => setView('recording'));
recordStart.addEventListener('click', startRecording); recordStop.addEventListener('click', () => stopRecording());
document.addEventListener('keydown', e => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.target.closest('button,a,input,textarea,video')) return;
  if (e.code === 'Space') { e.preventDefault(); act(controller.state.mode !== 'stars' ? 'scatter' : 'gather'); }
  else if (e.key.toLowerCase() === 'o') act('stage'); else if (e.key.toLowerCase() === 'r') act('reset');
});
document.addEventListener('visibilitychange', () => { lastFrame = performance.now(); if (document.hidden) stopRecording('页面进入后台，录制已结束。'); });
window.addEventListener('pagehide', () => {
  clearInterval(countdownTimer); countdownTimer = null;
  const session = activeRecording; activeRecording = null; recordState = 'idle';
  if (session) {
    session.failed = true;
    if (session.encoder && session.encoder.state !== 'closed') session.encoder.close();
    if (session.recorder && session.recorder.state !== 'inactive') session.recorder.stop();
    session.captured?.getTracks().forEach(track => track.stop()); session.chunks.length = 0; session.muxer = null; session.target = null;
  }
  scene.dispose(); stopCamera(); if (recordingUrl) URL.revokeObjectURL(recordingUrl); recordingUrl = null;
  recordPlayer.pause(); recordPlayer.removeAttribute('src'); recordPlayer.load(); recordDownload.removeAttribute('href'); $('#record-result').hidden = true;
});
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe(canvas);
$('#motion-toggle').addEventListener('click', () => { scene.setMotionPaused(!scene.motionPaused); syncMotion(); });
function syncMotion() { $('#motion-toggle').textContent = scene.motionPaused ? '继续动态效果' : '暂停动态效果'; $('#motion-toggle').setAttribute('aria-pressed', String(scene.motionPaused)); }
resize(); syncSceneUI(); syncMotion(); updateRecordingUI(); prepareRecordingEncoder(); document.body.dataset.ready = 'true'; requestAnimationFrame(render);
