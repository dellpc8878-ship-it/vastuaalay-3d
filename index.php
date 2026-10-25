<?php // VASTUAALAY 3D: redesigned comparison interface, existing local scanner retained. ?>
<!doctype html>
<html lang="hi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#fff9f0">
  <meta name="description" content="अपना 2D floor plan upload करके original 3D map और सरल वास्तु सुझाव देखें।">
  <title>VASTUAALAY 3D · Auto Floor Plan</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Hind:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="assets/css/style.css?v=7.0.0">
  <script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/"}}</script>
</head>
<body>
  <!-- Devotional page entry: pure CSS/SVG, no audio autoplay or external animation files. -->
  <div id="blessingIntro" class="blessing-intro" role="status" aria-label="VASTUAALAY 3D शुरू हो रहा है">
    <div class="blessing-stars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>
    <div class="blessing-center">
      <div class="blessing-mandala" aria-hidden="true"><span>ॐ</span></div>
      <div class="blessing-prayer" aria-hidden="true">🙏</div>
      <p class="blessing-mantra">ॐ श्री गणेशाय नमः</p>
      <h2>VASTUAALAY <span>3D</span></h2>
      <p class="blessing-message">शुभ आरम्भ · शुभ गृह · शुभ जीवन</p>
      <div class="blessing-progress" aria-hidden="true"><span></span></div>
      <p class="blessing-caption">आपके सपनों के घर की ओर एक शुभ कदम</p>
    </div>
    <button id="skipIntro" class="skip-intro" type="button" aria-label="प्रारम्भिक एनिमेशन छोड़ें">आगे बढ़ें <span aria-hidden="true">→</span></button>
  </div>
  <header class="header">
    <div class="header-inner">
      <a class="brand" href="#home" id="brandLink" aria-label="VASTUAALAY 3D Home">
        <span class="brand-icon">ॐ</span>
        <span class="brand-text"><strong>VASTUAALAY <em>3D</em></strong><small>वास्तु दर्शन · अपने घर का 3D नक्शा</small></span>
      </a>
      <nav class="main-nav" aria-label="Main navigation">
        <a href="#home" id="homeLink" class="nav-link active">Home</a>
        <a href="#compareStage" id="plannerLink" class="nav-link">3D Planner</a>
        <a href="#vastuReport" id="vastuLink" class="nav-link">Vastu Analysis</a>
        <a href="#vastuReport" id="reportsLink" class="nav-link">Reports</a>
      </nav>
      <div class="header-actions">
        <span class="version">AUTO v7.1</span>
        <button id="newBtn" class="new-btn" type="button" title="नया नक्शा अपलोड करें"><span aria-hidden="true">↻</span><span>नया नक्शा</span></button>
      </div>
    </div>
  </header>
  <main id="home">
    <section id="uploadStage" class="stage upload-stage">
      <div class="upload-shell">
        <span class="intro-symbol" aria-hidden="true">ॐ</span>
        <span class="eyebrow">VASTUAALAY 3D PLANNER</span>
        <h1>अपने घर का नक्शा अपलोड करें</h1>
        <p>एक ही जगह पर घर का 3D लेआउट और समझने में आसान वास्तु सुझाव।</p>
        <div class="upload-card">
          <label class="dropzone" id="dropzone">
            <input id="fileInput" type="file" accept=".png,.jpg,.jpeg,.webp,.pdf" hidden>
            <span class="upload-visual" aria-hidden="true">⇧</span>
            <strong>नक्शा चुनें या यहाँ Drop करें</strong>
            <small>JPG, PNG, WEBP, PDF (12 MB तक)</small>
            <span class="upload-select">नक्शा अपलोड करें <span aria-hidden="true">→</span></span>
          </label>
          <!-- Only displayed during a real scanner request; no fake percentage or countdown. -->
          <div id="scanExperience" class="scan-experience hidden" aria-label="नक्शे की स्कैनिंग जारी है">
            <div class="scan-visual-frame" aria-hidden="true">
              <div class="scan-grid"></div>
              <img id="scanPreview" class="scan-preview hidden" alt="">
              <div id="scanPdfPreview" class="scan-pdf-preview hidden">PDF <span>▤</span></div>
              <span class="scan-corner top-left"></span><span class="scan-corner top-right"></span>
              <span class="scan-corner bottom-left"></span><span class="scan-corner bottom-right"></span>
              <div class="scan-sweep"></div>
              <div class="scan-crosshair">+</div>
              <span class="scan-analysis-label">AUTO SCAN · ACTIVE</span>
            </div>
            <div class="scan-copy">
              <div class="scan-small-symbol" aria-hidden="true">ॐ</div>
              <h2>आपका नक्शा स्कैन हो रहा है</h2>
              <p id="scanPhase">दीवारों, कमरों और लिखे हुए नामों की जाँच हो रही है…</p>
              <div class="scan-indeterminate" aria-hidden="true"><span></span></div>
              <div class="scan-checkpoints" aria-hidden="true"><span>◉ दीवारें</span><span>◉ कमरे</span><span>◉ 3D दृश्य</span></div>
              <p class="scan-patience">कृपया यह पेज खुला रखें · समय नक्शे की जटिलता पर निर्भर है</p>
              <button id="cancelScanBtn" class="cancel-scan" type="button">स्कैन रोकें</button>
            </div>
          </div>
          <div id="scanStatus" class="status hidden" role="status" aria-live="polite"></div>
        </div>
        <div class="shubh-line" aria-hidden="true"><span>✺</span><span>शुभस्य शीघ्रम्</span><span>✺</span></div>
        <div class="upload-highlights" aria-label="Features"><span>✓ ऑटो स्कैन</span><span>✓ 3D मॉडल</span><span>✓ वास्तु रिपोर्ट</span></div>
        <p class="upload-note">हर map की automatic पहचान एक जैसी नहीं होती। साफ़ room labels और माप होने से बेहतर result मिलता है।</p>
      </div>
    </section>

    <section id="compareStage" class="stage hidden" aria-label="3D comparison and Vastu analysis">
      <div class="result-topline">
        <div><h1>आपके घर का 3D नक्शा</h1><p id="autoSummary">नक्शे का 3D तैयार है</p></div>
        <span class="result-pill"><span class="online-dot"></span> Auto Scan Result</span>
      </div>
      <div class="comparison-grid">
        <article class="viewer-card">
          <header class="viewer-heading"><div><h2>Original 3D Map</h2><p>आपके अपलोड किए नक्शे का 3D लेआउट</p></div><span class="viewer-type">Original</span></header>
          <div id="originalViewer" class="viewer" aria-label="Interactive original 3D house"></div>
          <div class="viewer-controls">
            <button class="view-btn" data-view="top" data-side="original" type="button"><span>▦</span> Top View</button>
            <button class="view-btn active" data-view="angle" data-side="original" type="button"><span>⬡</span> 3D View</button>
            <button class="view-btn" data-view="png" data-side="original" type="button"><span>⇩</span> Save PNG</button>
            <span class="drag-note">↻ Drag to rotate</span>
          </div>
        </article>
        <article class="viewer-card">
          <header class="viewer-heading"><div><h2>Vastu Suggested 3D Map</h2><p>वास्तु के अनुसार सुझाया गया 3D लेआउट</p></div><span class="viewer-type vastu">Suggested</span></header>
          <div id="vastuViewer" class="viewer" aria-label="Interactive Vastu suggested 3D house"></div>
          <div class="viewer-controls">
            <button class="view-btn" data-view="top" data-side="vastu" type="button"><span>▦</span> Top View</button>
            <button class="view-btn active" data-view="angle" data-side="vastu" type="button"><span>⬡</span> 3D View</button>
            <button class="view-btn" data-view="png" data-side="vastu" type="button"><span>⇩</span> Save PNG</button>
            <span class="drag-note">↻ Drag to rotate</span>
          </div>
        </article>
      </div>

      <section id="vastuReport" class="report-row" aria-label="वास्तु रिपोर्ट">
        <article class="insight-card good-panel">
          <div class="insight-heading"><span class="insight-icon good">✓</span><div class="insight-title"><h2>Sahi Hai</h2><p>इन जगहों का स्थान ठीक है</p></div><span id="goodCount" class="count-pill good">0</span></div>
          <div id="goodCards" class="insight-items"></div>
        </article>
        <article class="insight-card review-panel">
          <div class="insight-heading"><span class="insight-icon review">!</span><div class="insight-title"><h2>Sudhar Ki Salah</h2><p>इन जगहों में सुधार की सलाह है</p></div><span id="reviewCount" class="count-pill review">0</span></div>
          <div id="reviewCards" class="insight-items"></div>
        </article>
        <article class="insight-card unknown-panel">
          <div class="insight-heading"><span class="insight-icon unknown">?</span><div class="insight-title"><h2>Naam Clear Nahi Mila</h2><p>इन जगहों की पहचान स्पष्ट नहीं हुई</p></div><span id="unknownCount" class="count-pill unknown">0</span></div>
          <div id="unknownCards" class="insight-items"></div>
        </article>
      </section>
      <div class="info-strip"><span aria-hidden="true">ⓘ</span><div><p id="autoWarnings">Map scan का result अनुमानित हो सकता है।</p><p>3D में दिखाया furniture illustrative है। वास्तु सुझाव पारंपरिक मान्यताओं पर आधारित हैं; नक्शे में उत्तर दिशा साफ़ न मिले तो ऊपर को उत्तर माना गया है। निर्माण बदलने से पहले विशेषज्ञ से सलाह लें।</p><p id="ocrProgress" class="ocr-message hidden" aria-live="polite"></p></div></div>
    </section>
  </main>
  <footer>ॐ · शुभ गृह, शुभ जीवन <span class="dot">•</span> VASTUAALAY 3D</footer>
  <div id="toast" class="toast hidden" role="alert"></div>
  <script defer src="assets/js/ritual.js?v=7.0.0"></script>
  <script type="module" src="assets/js/app.js?v=7.1.0"></script>
</body>
</html>
