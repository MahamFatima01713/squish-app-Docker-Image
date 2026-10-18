(() => {
  "use strict";
  "use strict";

  /* ---------------------------------------------------------
     State
  --------------------------------------------------------- */
  const state = {
    images: [],
    quality: 75,
    globalFormat: "webp",
  };
  let nextId = 1;

  /* ---------------------------------------------------------
     DOM refs
  --------------------------------------------------------- */
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const browseBtn = document.getElementById("browseBtn");
  const demoBtn = document.getElementById("demoBtn");
  const controlsSection = document.getElementById("controlsSection");
  const resultsSection = document.getElementById("resultsSection");
  const cardsList = document.getElementById("cardsList");
  const cardTemplate = document.getElementById("cardTemplate");

  const qualityRange = document.getElementById("qualityRange");
  const qualityValue = document.getElementById("qualityValue");
  const formatSelect = document.getElementById("formatSelect");

  const statCount = document.getElementById("statCount");
  const statSaved = document.getElementById("statSaved");
  const downloadAllBtn = document.getElementById("downloadAllBtn");
  const clearBtn = document.getElementById("clearBtn");
  const toastHost = document.getElementById("toastHost");

  /* ---------------------------------------------------------
     Placeholder image generation (SVG data URIs — no canvas)
  --------------------------------------------------------- */
  const PALETTES = [
    ["#8457ee", "#22c8b3"],
    ["#ef7fc0", "#5b6cf0"],
    ["#37b6f0", "#8457ee"],
    ["#22c8b3", "#37b6f0"],
    ["#ef7fc0", "#8457ee"],
    ["#5b6cf0", "#22c8b3"],
  ];

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function svgDataUri(seed, detail) {
    const palette = PALETTES[seed % PALETTES.length];
    const rand = mulberry32(seed);
    let shapes = "";
    const shapeCount = detail ? 14 : 5;
    for (let i = 0; i < shapeCount; i++) {
      const cx = rand() * 400;
      const cy = rand() * 260;
      const r = 30 + rand() * (detail ? 70 : 130);
      const c = rand() > 0.5 ? palette[0] : palette[1];
      const op = detail ? 0.16 + rand() * 0.2 : 0.26 + rand() * 0.26;
      shapes += `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(0)}" fill="${c}" opacity="${op.toFixed(2)}"/>`;
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260">
      <defs>
        <linearGradient id="g${seed}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${palette[0]}"/>
          <stop offset="1" stop-color="${palette[1]}"/>
        </linearGradient>
        <filter id="blur${seed}"><feGaussianBlur stdDeviation="${detail ? 0 : 3}"/></filter>
      </defs>
      <rect width="400" height="260" fill="#f4f2fd"/>
      <rect width="400" height="260" fill="url(#g${seed})" opacity="0.13"/>
      <g filter="url(#blur${seed})">${shapes}</g>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  /* ---------------------------------------------------------
     Compression simulation
  --------------------------------------------------------- */
  const FORMAT_BASE_RATIO = {
    original: 0.72,
    jpeg: 0.55,
    png: 0.85,
    webp: 0.4,
  };

  function effectiveFormat(img) {
    return img.customFormat || state.globalFormat;
  }

  function estimateCompressedSize(img) {
    const fmt = effectiveFormat(img);
    const base = FORMAT_BASE_RATIO[fmt] ?? 0.6;
    const q = state.quality / 100;
    const qualityFactor = 0.12 + q * q * 0.78;
    let ratio = base * qualityFactor;
    ratio = Math.min(0.97, Math.max(0.03, ratio));
    return Math.max(1024, Math.round(img.originalBytes * ratio));
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(kb < 10 ? 2 : 1)} KB`;
    return `${(kb / 1024).toFixed(2)} MB`;
  }

  /* ---------------------------------------------------------
     Rendering
  --------------------------------------------------------- */
  function renderCard(img) {
    const node = cardTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.id = img.id;

    const beforeImg = node.querySelector(".compare-img--before");
    const afterImg = node.querySelector(".compare-img--after");
    beforeImg.src = img.beforeSrc;
    afterImg.src = img.afterSrc;
    beforeImg.alt = `${img.name} — original`;
    afterImg.alt = `${img.name} — optimized preview`;

    node.querySelector(".card__name").textContent = img.name;
    node.querySelector(".card__dims").textContent =
      `${img.width}×${img.height}px`;

    const formatSel = node.querySelector(".card__format");
    formatSel.value = img.customFormat || "original";
    formatSel.addEventListener("change", () => {
      img.customFormat =
        formatSel.value === "original" ? null : formatSel.value;
      updateCard(img);
      updateStats();
    });

    node.querySelector(".btn--download").addEventListener("click", (e) => {
      triggerDownload(img);
      pulse(e.currentTarget);
    });

    cardsList.appendChild(node);
    updateCard(img);
  }

  function updateCard(img) {
    const node = cardsList.querySelector(`.card[data-id="${img.id}"]`);
    if (!node) return;

    const compressed = estimateCompressedSize(img);
    img.lastCompressed = compressed;
    const reduction = Math.round((1 - compressed / img.originalBytes) * 100);

    node.querySelector(".card__original-size").textContent = formatBytes(
      img.originalBytes,
    );
    node.querySelector(".card__new-size").textContent = formatBytes(compressed);
    node.querySelector(".card__reduction").textContent = `-${reduction}%`;

    const bar = node.querySelector(".card__progress-bar");
    requestAnimationFrame(() => {
      bar.style.width = `${Math.max(4, reduction)}%`;
    });
  }

  function updateAllCards() {
    state.images.forEach(updateCard);
  }

  function updateStats() {
    statCount.textContent = state.images.length;
    if (!state.images.length) {
      statSaved.textContent = "0%";
      downloadAllBtn.disabled = true;
      return;
    }
    downloadAllBtn.disabled = false;
    const totals = state.images.reduce(
      (acc, img) => {
        const compressed = img.lastCompressed ?? estimateCompressedSize(img);
        acc.orig += img.originalBytes;
        acc.comp += compressed;
        return acc;
      },
      { orig: 0, comp: 0 },
    );
    const pct = totals.orig
      ? Math.round((1 - totals.comp / totals.orig) * 100)
      : 0;
    statSaved.textContent = `${pct}%`;
  }

  /* ---------------------------------------------------------
     Adding images
  --------------------------------------------------------- */
  function addSyntheticImage(name, sizeKB) {
    const id = nextId++;
    const seed = id * 7919;
    const img = {
      id,
      name,
      width: 1600,
      height: 1040,
      originalBytes: Math.round(sizeKB * 1024),
      customFormat: null,
      beforeSrc: svgDataUri(seed, true),
      afterSrc: svgDataUri(seed, false),
      isReal: false,
    };
    state.images.push(img);
    revealSections();
    renderCard(img);
    updateStats();
  }

  function addRealFile(file) {
    if (!file.type.startsWith("image/")) return;
    const id = nextId++;
    const url = URL.createObjectURL(file);
    const probe = new Image();
    probe.onload = () => {
      const img = {
        id,
        name: file.name,
        width: probe.naturalWidth || 1200,
        height: probe.naturalHeight || 800,
        originalBytes: file.size,
        customFormat: null,
        beforeSrc: url,
        afterSrc: url,
        objectUrl: url,
        isReal: true,
      };
      state.images.push(img);
      revealSections();
      renderCard(img);
      updateStats();
    };
    probe.onerror = () => URL.revokeObjectURL(url);
    probe.src = url;
  }

  function revealSections() {
    controlsSection.hidden = false;
    resultsSection.hidden = false;
  }

  const DEMO_FILES = [
    ["mountain-landscape.jpg", 5120],
    ["product-photo.png", 6440],
    ["sunset.webp", 3210],
  ];

  demoBtn.addEventListener("click", () => {
    DEMO_FILES.forEach(([name, size], i) => {
      setTimeout(() => addSyntheticImage(name, size), i * 100);
    });
    toast("Loaded demo images");
  });

  browseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  /* ---------------------------------------------------------
     Drag & drop / file input
  --------------------------------------------------------- */
  dropzone.addEventListener("click", (e) => {
    if (e.target === demoBtn || e.target === browseBtn) return;
    fileInput.click();
  });
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });

  ["dragenter", "dragover"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("is-dragover");
    }),
  );
  ["dragleave", "dragend"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      if (evt === "dragleave" && dropzone.contains(e.relatedTarget)) return;
      dropzone.classList.remove("is-dragover");
    }),
  );
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("is-dragover");
    const files = Array.from(e.dataTransfer.files || []);
    files.forEach(addRealFile);
  });
  fileInput.addEventListener("change", () => {
    Array.from(fileInput.files || []).forEach(addRealFile);
    fileInput.value = "";
  });

  /* ---------------------------------------------------------
     Global controls
  --------------------------------------------------------- */
  function paintRangeFill() {
    qualityRange.style.setProperty("--range-fill", `${qualityRange.value}%`);
  }
  qualityRange.addEventListener("input", () => {
    state.quality = Number(qualityRange.value);
    qualityValue.textContent = `${state.quality}%`;
    paintRangeFill();
    updateAllCards();
    updateStats();
  });
  paintRangeFill();

  formatSelect.addEventListener("change", () => {
    state.globalFormat = formatSelect.value;
    updateAllCards();
    updateStats();
  });

  clearBtn.addEventListener("click", () => {
    state.images.forEach(
      (img) => img.objectUrl && URL.revokeObjectURL(img.objectUrl),
    );
    state.images = [];
    cardsList.innerHTML = "";
    controlsSection.hidden = true;
    resultsSection.hidden = true;
    updateStats();
  });

  /* ---------------------------------------------------------
     Downloads (simulated / real passthrough)
  --------------------------------------------------------- */
  function triggerDownload(img) {
    if (img.isReal && img.objectUrl) {
      const a = document.createElement("a");
      a.href = img.objectUrl;
      a.download = img.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast(`Downloading ${img.name}`);
    } else {
      toast("Download ready — compression engine will be connected later.");
    }
  }

  downloadAllBtn.addEventListener("click", () => {
    if (!state.images.length) return;
    downloadAllBtn.disabled = true;
    const original = downloadAllBtn.innerHTML;
    downloadAllBtn.innerHTML = "Preparing your optimized images…";
    toast("Preparing your optimized images…");
    setTimeout(() => {
      downloadAllBtn.innerHTML = original;
      downloadAllBtn.disabled = false;
      toast(
        `Zipped ${state.images.length} image${state.images.length > 1 ? "s" : ""} — download started`,
      );
    }, 1000);
  });

  function pulse(el) {
    el.style.transform = "scale(0.94)";
    setTimeout(() => {
      el.style.transform = "";
    }, 140);
  }

  /* ---------------------------------------------------------
     Toasts
  --------------------------------------------------------- */
  function toast(message) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = message;
    toastHost.appendChild(el);
    requestAnimationFrame(() => el.classList.add("is-visible"));
    setTimeout(() => {
      el.classList.remove("is-visible");
      setTimeout(() => el.remove(), 280);
    }, 2600);
  }
})();
