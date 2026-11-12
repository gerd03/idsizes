(() => {
  "use strict";

  // App State
  const state = {
    paperSize: "a4",
    templateType: "passport",
    guideStyle: "both",
    cropRatio: "passport", // 'passport' (35:45) or 'square' (1:1)
    rawImage: null,
    imageLoaded: false,
    zoom: 1.0,
    panX: 0,
    panY: 0,
    rotation: 0,
    showBiometricGuide: true,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    initialPinchDist: 0,
    initialPinchZoom: 1.0,
    pendingDownload: null,
  };

  // Capacities
  const CAPACITIES = {
    a4: { passport: 30, "2x2": 15, "1x1": 70, combo: 26 },
    legal: { passport: 35, "2x2": 18, "1x1": 84, combo: 29 },
  };

  // DOM Elements
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const editorContainer = document.getElementById("editorContainer");
  const canvasWrapper = document.getElementById("canvasWrapper");
  const cropCanvas = document.getElementById("cropCanvas");
  const cropCtx = cropCanvas.getContext("2d");
  const cropMaskPath = document.getElementById("cropMaskPath");
  const cropFrameRect = document.getElementById("cropFrameRect");
  const biometricOval = document.getElementById("biometricOval");
  const guideCrossH = document.getElementById("guideCrossH");
  const guideCrossV = document.getElementById("guideCrossV");

  const zoomSlider = document.getElementById("zoomSlider");
  const zoomInBtn = document.getElementById("zoomInBtn");
  const zoomOutBtn = document.getElementById("zoomOutBtn");
  const zoomPctBadge = document.getElementById("zoomPctBadge");
  const rotateBtn = document.getElementById("rotateBtn");
  const resetCropBtn = document.getElementById("resetCropBtn");
  const toggleGuideBtn = document.getElementById("toggleGuideBtn");
  const changePhotoBtn = document.getElementById("changePhotoBtn");
  const ratioPills = document.querySelectorAll(".ratio-pill");

  const paperOptions = document.querySelectorAll(".pill-option");
  const templateCards = document.querySelectorAll(".template-card");
  const guidePills = document.querySelectorAll(".guide-pill");
  const sheetCanvas = document.getElementById("sheetPreviewCanvas");
  const sheetCtx = sheetCanvas.getContext("2d");
  const previewSheetCap = document.getElementById("previewSheetCap");

  const downloadDocxBtn = document.getElementById("downloadDocxBtn");
  const downloadPdfBtn = document.getElementById("downloadPdfBtn");

  // Modal elements
  const appModal = document.getElementById("appModal");
  const modalStateLoading = document.getElementById("modalStateLoading");
  const modalStateSuccess = document.getElementById("modalStateSuccess");
  const modalStateAlert = document.getElementById("modalStateAlert");
  const loadingTitle = document.getElementById("loadingTitle");
  const loadingDesc = document.getElementById("loadingDesc");
  const summaryFileName = document.getElementById("summaryFileName");
  const summaryFormatBadge = document.getElementById("summaryFormatBadge");
  const summaryLayout = document.getElementById("summaryLayout");
  const summaryPaper = document.getElementById("summaryPaper");
  const modalDownloadBtnText = document.getElementById("modalDownloadBtnText");
  const modalConfirmDownloadBtn = document.getElementById("modalConfirmDownloadBtn");
  const modalCloseBtn = document.getElementById("modalCloseBtn");
  const alertTitle = document.getElementById("alertTitle");
  const alertDesc = document.getElementById("alertDesc");
  const alertActionBtn = document.getElementById("alertActionBtn");
  const alertCloseBtn = document.getElementById("alertCloseBtn");

  const tipsDrawer = document.getElementById("tipsDrawer");
  const tipsHeader = document.getElementById("tipsHeader");

  // Haptic feedback helper
  function triggerHaptic(pattern = [15, 30, 15]) {
    if (navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch (e) {}
    }
  }

  // Modal helpers
  function showModalState(stateName) {
    modalStateLoading.style.display = "none";
    modalStateSuccess.style.display = "none";
    modalStateAlert.style.display = "none";

    if (stateName === "loading") modalStateLoading.style.display = "flex";
    if (stateName === "success") modalStateSuccess.style.display = "flex";
    if (stateName === "alert") modalStateAlert.style.display = "flex";

    appModal.classList.add("active");
  }

  function hideModal() {
    appModal.classList.remove("active");
  }

  modalCloseBtn.addEventListener("click", () => {
    hideModal();
    triggerHaptic(10);
  });

  alertCloseBtn.addEventListener("click", () => {
    hideModal();
    triggerHaptic(10);
  });

  alertActionBtn.addEventListener("click", () => {
    hideModal();
    fileInput.click();
  });

  // Tips drawer toggle
  tipsHeader.addEventListener("click", () => {
    tipsDrawer.classList.toggle("open");
    triggerHaptic(10);
  });

  // Setup Image Upload
  dropzone.addEventListener("click", () => fileInput.click());
  changePhotoBtn.addEventListener("click", () => fileInput.click());

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  });

  function handleFile(file) {
    if (!file.type.startsWith("image/")) {
      alertTitle.textContent = "Invalid File";
      alertDesc.textContent = "Please choose a valid JPG, PNG, or WEBP photo.";
      alertActionBtn.textContent = "Choose Another";
      showModalState("alert");
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      const img = new Image();
      img.onload = () => {
        state.rawImage = img;
        state.imageLoaded = true;
        state.zoom = 1.0;
        state.panX = 0;
        state.panY = 0;
        state.rotation = 0;
        zoomSlider.value = 1.0;
        zoomPctBadge.textContent = "100%";

        dropzone.style.display = "none";
        editorContainer.style.display = "flex";
        changePhotoBtn.style.display = "inline-flex";

        resizeCropCanvas();
        updateCropOverlay();
        renderCropCanvas();
        renderSheetPreview();
        triggerHaptic([20, 40]);
      };
      img.src = evt.target.result;
    };
    reader.readAsDataURL(file);
  }

  // Crop Canvas Handling
  function resizeCropCanvas() {
    const rect = canvasWrapper.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    cropCanvas.width = rect.width * dpr;
    cropCanvas.height = rect.height * dpr;
    cropCtx.scale(dpr, dpr);
  }

  window.addEventListener("resize", () => {
    if (state.imageLoaded) {
      resizeCropCanvas();
      renderCropCanvas();
      renderSheetPreview();
    }
  });

  // Aspect ratio pill switches
  ratioPills.forEach((pill) => {
    pill.addEventListener("click", () => {
      ratioPills.forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      state.cropRatio = pill.dataset.ratio;
      updateCropOverlay();
      renderCropCanvas();
      renderSheetPreview();
      triggerHaptic(10);
    });
  });

  function getFrameBounds() {
    const rect = canvasWrapper.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const targetRatio = state.cropRatio === "passport" ? 35.0 / 45.0 : 1.0;

    let fw, fh;
    const padding = 20;
    const maxW = w - padding * 2;
    const maxH = h - padding * 2;

    if (maxW / maxH > targetRatio) {
      fh = maxH;
      fw = fh * targetRatio;
    } else {
      fw = maxW;
      fh = fw / targetRatio;
    }

    const fx = (w - fw) / 2;
    const fy = (h - fh) / 2;
    return { fx, fy, fw, fh, w, h };
  }

  function updateCropOverlay() {
    const { fx, fy, fw, fh, w, h } = getFrameBounds();
    const xPct = (fx / w) * 100;
    const yPct = (fy / h) * 100;
    const wPct = (fw / w) * 100;
    const hPct = (fh / h) * 100;

    // SVG evenodd path: outer 0..100, inner frame hole
    const maskD = `M 0 0 L 100 0 L 100 100 L 0 100 Z M ${xPct} ${yPct} L ${xPct + wPct} ${yPct} L ${xPct + wPct} ${yPct + hPct} L ${xPct} ${yPct + hPct} Z`;
    cropMaskPath.setAttribute("d", maskD);

    cropFrameRect.setAttribute("x", xPct);
    cropFrameRect.setAttribute("y", yPct);
    cropFrameRect.setAttribute("width", wPct);
    cropFrameRect.setAttribute("height", hPct);

    const showGuide = state.showBiometricGuide;
    if (showGuide) {
      biometricOval.style.display = "block";
      biometricOval.setAttribute("cx", xPct + wPct / 2);
      biometricOval.setAttribute("cy", yPct + hPct * 0.45);
      biometricOval.setAttribute("rx", wPct * 0.32);
      biometricOval.setAttribute("ry", hPct * 0.30);

      guideCrossH.style.display = "block";
      guideCrossV.style.display = "block";
    } else {
      biometricOval.style.display = "none";
      guideCrossH.style.display = "none";
      guideCrossV.style.display = "none";
    }
  }

  function renderCropCanvas() {
    if (!state.rawImage) return;
    const rect = canvasWrapper.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    cropCtx.clearRect(0, 0, w, h);
    cropCtx.save();

    // Center of canvas
    cropCtx.translate(w / 2 + state.panX, h / 2 + state.panY);
    cropCtx.rotate((state.rotation * Math.PI) / 180);
    cropCtx.scale(state.zoom, state.zoom);

    const img = state.rawImage;
    // Scale image to fill frame by default
    const scale = Math.max(w / img.width, h / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;

    cropCtx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    cropCtx.restore();
  }

  // Pointer & Drag handling on Canvas Wrapper
  canvasWrapper.addEventListener("pointerdown", (e) => {
    state.isDragging = true;
    state.dragStartX = e.clientX - state.panX;
    state.dragStartY = e.clientY - state.panY;
    canvasWrapper.setPointerCapture(e.pointerId);
  });

  canvasWrapper.addEventListener("pointermove", (e) => {
    if (!state.isDragging) return;
    state.panX = e.clientX - state.dragStartX;
    state.panY = e.clientY - state.dragStartY;
    renderCropCanvas();
  });

  const stopDrag = (e) => {
    if (state.isDragging) {
      state.isDragging = false;
      renderSheetPreview();
    }
  };
  canvasWrapper.addEventListener("pointerup", stopDrag);
  canvasWrapper.addEventListener("pointercancel", stopDrag);

  // Pinch-to-zoom for touch devices
  let activeTouches = [];
  canvasWrapper.addEventListener("touchstart", (e) => {
    activeTouches = e.touches;
    if (activeTouches.length === 2) {
      const dx = activeTouches[0].clientX - activeTouches[1].clientX;
      const dy = activeTouches[0].clientY - activeTouches[1].clientY;
      state.initialPinchDist = Math.hypot(dx, dy);
      state.initialPinchZoom = state.zoom;
    }
  }, { passive: true });

  canvasWrapper.addEventListener("touchmove", (e) => {
    activeTouches = e.touches;
    if (activeTouches.length === 2) {
      const dx = activeTouches[0].clientX - activeTouches[1].clientX;
      const dy = activeTouches[0].clientY - activeTouches[1].clientY;
      const dist = Math.hypot(dx, dy);
      if (state.initialPinchDist > 0) {
        const factor = dist / state.initialPinchDist;
        setZoom(Math.min(3.0, Math.max(1.0, state.initialPinchZoom * factor)));
      }
    }
  }, { passive: true });

  function setZoom(val) {
    state.zoom = Math.round(val * 100) / 100;
    zoomSlider.value = state.zoom;
    zoomPctBadge.textContent = `${Math.round(state.zoom * 100)}%`;
    renderCropCanvas();
  }

  zoomSlider.addEventListener("input", (e) => {
    setZoom(parseFloat(e.target.value));
    renderSheetPreview();
  });

  zoomInBtn.addEventListener("click", () => {
    setZoom(Math.min(3.0, state.zoom + 0.1));
    renderSheetPreview();
    triggerHaptic(10);
  });

  zoomOutBtn.addEventListener("click", () => {
    setZoom(Math.max(1.0, state.zoom - 0.1));
    renderSheetPreview();
    triggerHaptic(10);
  });

  rotateBtn.addEventListener("click", () => {
    state.rotation = (state.rotation + 90) % 360;
    renderCropCanvas();
    renderSheetPreview();
    triggerHaptic(15);
  });

  resetCropBtn.addEventListener("click", () => {
    setZoom(1.0);
    state.panX = 0;
    state.panY = 0;
    state.rotation = 0;
    renderCropCanvas();
    renderSheetPreview();
    triggerHaptic(15);
  });

  toggleGuideBtn.addEventListener("click", () => {
    state.showBiometricGuide = !state.showBiometricGuide;
    toggleGuideBtn.classList.toggle("active", state.showBiometricGuide);
    updateCropOverlay();
    triggerHaptic(10);
  });

  // Paper & Template Selection Listeners
  paperOptions.forEach((btn) => {
    btn.addEventListener("click", () => {
      paperOptions.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.paperSize = btn.dataset.paper;
      updateCapacities();
      renderSheetPreview();
      triggerHaptic(15);
    });
  });

  templateCards.forEach((card) => {
    card.addEventListener("click", () => {
      templateCards.forEach((c) => c.classList.remove("active"));
      card.classList.add("active");
      state.templateType = card.dataset.template;

      // Auto-sync crop ratio pill
      if (state.templateType === "passport") {
        setCropRatio("passport");
      } else if (state.templateType === "2x2" || state.templateType === "1x1") {
        setCropRatio("square");
      }

      renderSheetPreview();
      triggerHaptic(15);
    });
  });

  function setCropRatio(ratio) {
    state.cropRatio = ratio;
    ratioPills.forEach((p) => {
      p.classList.toggle("active", p.dataset.ratio === ratio);
    });
    updateCropOverlay();
    renderCropCanvas();
  }

  guidePills.forEach((pill) => {
    pill.addEventListener("click", () => {
      guidePills.forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      state.guideStyle = pill.dataset.guide;
      renderSheetPreview();
      triggerHaptic(10);
    });
  });

  function updateCapacities() {
    const caps = CAPACITIES[state.paperSize];
    document.getElementById("capPassport").textContent = `${caps.passport} photos`;
    document.getElementById("cap2x2").textContent = `${caps["2x2"]} photos`;
    document.getElementById("cap1x1").textContent = `${caps["1x1"]} photos`;
    document.getElementById("capCombo").textContent = `${caps.combo} photos`;
  }

  // Extract cropped image as an offscreen canvas
  function getCroppedPhotoCanvas(targetW, targetH) {
    const offCanvas = document.createElement("canvas");
    offCanvas.width = targetW;
    offCanvas.height = targetH;
    const offCtx = offCanvas.getContext("2d");

    if (!state.rawImage) {
      // Default placeholder avatar
      offCtx.fillStyle = "#1e2333";
      offCtx.fillRect(0, 0, targetW, targetH);
      offCtx.fillStyle = "#3d4763";
      offCtx.beginPath();
      offCtx.arc(targetW / 2, targetH * 0.42, targetW * 0.22, 0, Math.PI * 2);
      offCtx.fill();
      offCtx.beginPath();
      offCtx.ellipse(targetW / 2, targetH * 0.9, targetW * 0.4, targetH * 0.35, 0, 0, Math.PI * 2);
      offCtx.fill();
      return offCanvas;
    }

    const { fx, fy, fw, fh, w, h } = getFrameBounds();
    const scaleFactor = targetW / fw;

    offCtx.save();
    offCtx.translate(-fx * scaleFactor, -fy * scaleFactor);
    offCtx.translate((w / 2 + state.panX) * scaleFactor, (h / 2 + state.panY) * scaleFactor);
    offCtx.rotate((state.rotation * Math.PI) / 180);
    offCtx.scale(state.zoom * scaleFactor, state.zoom * scaleFactor);

    const img = state.rawImage;
    const imgScale = Math.max(w / img.width, h / img.height);
    const drawW = img.width * imgScale;
    const drawH = img.height * imgScale;

    offCtx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    offCtx.restore();

    return offCanvas;
  }

  // Live Sheet Preview Rendering
  function renderSheetPreview() {
    const isA4 = state.paperSize === "a4";
    const pw = isA4 ? 210 : 215.9;
    const ph = isA4 ? 297 : 355.6;

    const previewScale = 1.7;
    sheetCanvas.width = pw * previewScale;
    sheetCanvas.height = ph * previewScale;

    sheetCtx.fillStyle = "#ffffff";
    sheetCtx.fillRect(0, 0, sheetCanvas.width, sheetCanvas.height);

    // Safe Margins Zone (>13mm border) in subtle green dash
    sheetCtx.strokeStyle = "rgba(16, 185, 129, 0.45)";
    sheetCtx.lineWidth = 1;
    sheetCtx.setLineDash([3, 3]);
    const safeM = 13.0 * previewScale;
    sheetCtx.strokeRect(safeM, safeM, sheetCanvas.width - safeM * 2, sheetCanvas.height - safeM * 2);
    sheetCtx.setLineDash([]);

    // Determine grid sections
    let sections = [];
    let count = 0;

    if (state.templateType === "combo") {
      if (isA4) {
        sections = [
          { rows: 2, cols: 3, cw: 50.8, ch: 50.8, x: 28.8, y: 14.0, ratio: "square" },
          { rows: 2, cols: 4, cw: 35.0, ch: 45.0, x: 35.0, y: 119.6, ratio: "passport" },
          { rows: 2, cols: 6, cw: 25.4, ch: 25.4, x: 28.8, y: 213.6, ratio: "square" },
        ];
        count = 26;
      } else {
        sections = [
          { rows: 3, cols: 3, cw: 50.8, ch: 50.8, x: 31.75, y: 20.0, ratio: "square" },
          { rows: 2, cols: 4, cw: 35.0, ch: 45.0, x: 37.95, y: 177.4, ratio: "passport" },
          { rows: 2, cols: 6, cw: 25.4, ch: 25.4, x: 31.75, y: 272.4, ratio: "square" },
        ];
        count = 29;
      }
    } else if (state.templateType === "passport") {
      const rows = isA4 ? 6 : 7;
      const x0 = isA4 ? 17.5 : 20.45;
      const y0 = isA4 ? 13.0 : 20.0;
      sections = [{ rows, cols: 5, cw: 35.0, ch: 45.0, x: x0, y: y0, ratio: "passport" }];
      count = rows * 5;
    } else if (state.templateType === "2x2") {
      const rows = isA4 ? 5 : 6;
      const x0 = isA4 ? 28.8 : 31.75;
      const y0 = isA4 ? 21.0 : 25.0;
      sections = [{ rows, cols: 3, cw: 50.8, ch: 50.8, x: x0, y: y0, ratio: "square" }];
      count = rows * 3;
    } else if (state.templateType === "1x1") {
      const rows = isA4 ? 10 : 12;
      const x0 = isA4 ? 16.1 : 19.05;
      const y0 = isA4 ? 21.0 : 25.0;
      sections = [{ rows, cols: 7, cw: 25.4, ch: 25.4, x: x0, y: y0, ratio: "square" }];
      count = rows * 7;
    }

    previewSheetCap.textContent = `${count} Photos`;

    // Render cells & photos
    sections.forEach((sec) => {
      const cwPx = sec.cw * previewScale;
      const chPx = sec.ch * previewScale;
      const x0Px = sec.x * previewScale;
      const y0Px = sec.y * previewScale;

      const photoCanvas = getCroppedPhotoCanvas(cwPx, chPx);

      for (let r = 0; r < sec.rows; r++) {
        for (let c = 0; c < sec.cols; c++) {
          const cx = x0Px + c * cwPx;
          const cy = y0Px + r * chPx;

          sheetCtx.drawImage(photoCanvas, cx, cy, cwPx, chPx);

          // Cutting guides
          if (state.guideStyle === "lines" || state.guideStyle === "both") {
            sheetCtx.strokeStyle = "#a0a0a0";
            sheetCtx.lineWidth = 0.8;
            sheetCtx.strokeRect(cx, cy, cwPx, chPx);
          }

          if (state.guideStyle === "marks" || state.guideStyle === "both") {
            sheetCtx.strokeStyle = "#555555";
            sheetCtx.lineWidth = 1;
            const tick = 6;
            sheetCtx.beginPath();
            // Top-left
            sheetCtx.moveTo(cx - tick, cy); sheetCtx.lineTo(cx, cy);
            sheetCtx.moveTo(cx, cy - tick); sheetCtx.lineTo(cx, cy);
            // Bottom-right
            sheetCtx.moveTo(cx + cwPx, cy + chPx); sheetCtx.lineTo(cx + cwPx + tick, cy + chPx);
            sheetCtx.moveTo(cx + cwPx, cy + chPx); sheetCtx.lineTo(cx + cwPx, cy + chPx + tick);
            sheetCtx.stroke();
          }
        }
      }
    });
  }

  // Calculate normalized crop coordinates for backend
  function getCropNormalized() {
    if (!state.rawImage) return { x: 0, y: 0, w: 1, h: 1 };
    const { fx, fy, fw, fh, w, h } = getFrameBounds();
    const img = state.rawImage;
    const imgScale = Math.max(w / img.width, h / img.height);
    const drawW = img.width * imgScale;
    const drawH = img.height * imgScale;

    const imgCenterX = w / 2 + state.panX;
    const imgCenterY = h / 2 + state.panY;
    const frameCenterX = fx + fw / 2;
    const frameCenterY = fy + fh / 2;

    const diffX = (frameCenterX - imgCenterX) / state.zoom;
    const diffY = (frameCenterY - imgCenterY) / state.zoom;

    const frameWInImg = fw / (state.zoom * imgScale);
    const frameHInImg = fh / (state.zoom * imgScale);

    const normW = Math.min(1.0, frameWInImg / img.width);
    const normH = Math.min(1.0, frameHInImg / img.height);
    const normX = Math.max(0, Math.min(1 - normW, (img.width / 2 + diffX / imgScale - frameWInImg / 2) / img.width));
    const normY = Math.max(0, Math.min(1 - normH, (img.height / 2 + diffY / imgScale - frameHInImg / 2) / img.height));

    return { x: normX, y: normY, w: normW, h: normH };
  }

  // Generate & Download Handler with Full In-App Modal Feedback
  async function requestDownload(format) {
    if (!state.rawImage) {
      alertTitle.textContent = "Photo Required";
      alertDesc.textContent = "Please upload or snap a photo before downloading the print grid.";
      alertActionBtn.textContent = "Upload Photo";
      showModalState("alert");
      triggerHaptic([30, 60]);
      return;
    }

    triggerHaptic([20, 50, 20]);
    loadingTitle.textContent = `Generating ${format.toUpperCase()}...`;
    loadingDesc.textContent = "Building exact millimeter print grid & cutting guides...";
    showModalState("loading");

    const cropNorm = getCropNormalized();
    const formData = new FormData();
    formData.append("paper_size", state.paperSize);
    formData.append("template_type", state.templateType);
    formData.append("format", format);
    formData.append("guide_style", state.guideStyle);
    formData.append("crop_x", cropNorm.x);
    formData.append("crop_y", cropNorm.y);
    formData.append("crop_w", cropNorm.w);
    formData.append("crop_h", cropNorm.h);

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = state.rawImage.width;
    tempCanvas.height = state.rawImage.height;
    const tCtx = tempCanvas.getContext("2d");
    tCtx.drawImage(state.rawImage, 0, 0);

    tempCanvas.toBlob(async (blob) => {
      formData.append("image", blob, "photo.jpg");

      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          throw new Error(`Server returned status ${res.status}`);
        }

        const resBlob = await res.blob();
        const disposition = res.headers.get("content-disposition");
        let filename = `PhotoPrint_${state.paperSize.toUpperCase()}_${state.templateType}.${format}`;
        if (disposition && disposition.indexOf("filename=") !== -1) {
          const match = disposition.match(/filename="?([^"]+)"?/);
          if (match && match[1]) filename = match[1];
        }

        const url = window.URL.createObjectURL(resBlob);
        
        // Store download payload - DO NOT auto-download so user can review critical print settings!
        state.pendingDownload = { url, filename, format };

        // Update summary details
        if (summaryFileName) summaryFileName.textContent = filename;
        if (summaryFormatBadge) summaryFormatBadge.textContent = format === "pdf" ? "PDF 300 DPI" : "DOCX Grid";
        
        const count = CAPACITIES[state.paperSize][state.templateType];
        const isA4 = state.paperSize === "a4";
        if (summaryPaper) summaryPaper.textContent = isA4 ? "A4 (210×297)" : "Legal (8.5×14)";
        if (summaryLayout) summaryLayout.textContent = `${count} photos`;

        // Reset confirm download button to ready state
        if (modalDownloadBtnText) modalDownloadBtnText.textContent = `Download & Save ${format.toUpperCase()} Now`;
        if (modalConfirmDownloadBtn) modalConfirmDownloadBtn.style.background = "";
        if (modalCloseBtn) modalCloseBtn.textContent = "Cancel";

        showModalState("success");
        triggerHaptic([25, 50, 25]);
      } catch (err) {
        console.error("Backend generation error:", err);
        alertTitle.textContent = "Generation Error";
        alertDesc.textContent = `Could not generate file: ${err.message}. Make sure the local server is running.`;
        alertActionBtn.textContent = "Try Again";
        showModalState("alert");
      }
    }, "image/jpeg", 0.95);
  }

  // User explicitly clicks to confirm and download the file from modal
  modalConfirmDownloadBtn.addEventListener("click", () => {
    if (!state.pendingDownload) return;
    
    const { url, filename } = state.pendingDownload;
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    modalDownloadBtnText.textContent = "✓ File Saved to Downloads!";
    modalConfirmDownloadBtn.style.background = "var(--success)";
    modalCloseBtn.textContent = "Done";
    triggerHaptic([30, 70, 30]);
  });

  downloadDocxBtn.addEventListener("click", () => requestDownload("docx"));
  downloadPdfBtn.addEventListener("click", () => requestDownload("pdf"));

  // Initial Sheet Preview Render
  updateCapacities();
  renderSheetPreview();

  // ========================================================
  // 3D MINIMALIST INTERACTIVE TILT FOR HEADER CARD
  // ========================================================
  const headerCardWrapper = document.getElementById("header3dCard");
  const headerCard = headerCardWrapper ? headerCardWrapper.querySelector(".header-3d-card") : null;
  const headerGlare = headerCardWrapper ? headerCardWrapper.querySelector(".header-3d-glare") : null;

  if (headerCardWrapper && headerCard) {
    let isHovering = false;
    let targetRotX = 0;
    let targetRotY = 0;
    let currentRotX = 0;
    let currentRotY = 0;

    function handle3DMove(clientX, clientY) {
      const rect = headerCardWrapper.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const normX = (clientX - centerX) / (rect.width / 2);
      const normY = (clientY - centerY) / (rect.height / 2);

      targetRotY = Math.max(-25, Math.min(25, normX * 22));
      targetRotX = Math.max(-25, Math.min(25, -normY * 22));

      if (headerGlare) {
        const glareX = 50 + normX * 40;
        const glareY = 50 + normY * 40;
        headerGlare.style.background = `radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255, 255, 255, 0.5) 0%, transparent 65%)`;
      }
    }

    headerCardWrapper.addEventListener("pointermove", (e) => {
      isHovering = true;
      handle3DMove(e.clientX, e.clientY);
    });

    headerCardWrapper.addEventListener("pointerleave", () => {
      isHovering = false;
      targetRotX = 0;
      targetRotY = 0;
      if (headerGlare) {
        headerGlare.style.background = "radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.4) 0%, transparent 65%)";
      }
    });

    headerCardWrapper.addEventListener("click", () => {
      triggerHaptic([20, 40]);
      headerCard.style.transform = "scale(0.92) translateZ(10px)";
      setTimeout(() => {
        headerCard.style.transform = "";
      }, 150);
    });

    // Smooth 60fps Lerp animation loop for physical emergence
    function update3DLerp() {
      if (isHovering) {
        currentRotX += (targetRotX - currentRotX) * 0.15;
        currentRotY += (targetRotY - currentRotY) * 0.15;
        headerCard.style.transform = `translateZ(30px) rotateX(${currentRotX.toFixed(2)}deg) rotateY(${currentRotY.toFixed(2)}deg)`;
        headerCard.style.animation = "none";
      } else {
        currentRotX += (0 - currentRotX) * 0.1;
        currentRotY += (0 - currentRotY) * 0.1;
        if (Math.abs(currentRotX) > 0.05 || Math.abs(currentRotY) > 0.05) {
          headerCard.style.transform = `translateZ(24px) rotateX(${currentRotX.toFixed(2)}deg) rotateY(${currentRotY.toFixed(2)}deg)`;
        } else {
          headerCard.style.animation = "cardFloat 4s ease-in-out infinite";
        }
      }
      requestAnimationFrame(update3DLerp);
    }
    requestAnimationFrame(update3DLerp);
  }

})();