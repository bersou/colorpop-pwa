// Dom Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const editorZone = document.getElementById('editor-zone');
const outputCanvas = document.getElementById('output-canvas');
const processingOverlay = document.getElementById('processing-overlay');

const blurSlider = document.getElementById('blur-slider');
const thresholdSlider = document.getElementById('threshold-slider');
const featherSlider = document.getElementById('feather-slider');
const saturationSlider = document.getElementById('saturation-slider');

const blurValue = document.getElementById('blur-value');
const thresholdValue = document.getElementById('threshold-value');
const featherValue = document.getElementById('feather-value');
const saturationValue = document.getElementById('saturation-value');

const btnReset = document.getElementById('btn-reset');
const btnDownload = document.getElementById('btn-download');

// Canvas Contexts & State
const ctx = outputCanvas.getContext('2d');
let activeImage = null;
let segmentationMaskCanvas = null;
let selfieSegmentation = null;
let isSegmenting = false;

// Initialize MediaPipe Selfie Segmentation
function initModel() {
    selfieSegmentation = new SelfieSegmentation({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`;
        }
    });

    selfieSegmentation.setOptions({
        modelSelection: 1, // 1 runs landscape model
    });

    selfieSegmentation.onResults(onSegmentationResults);
}

// Drag & Drop Handlers
dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
});

// Load and Process File
function handleFile(file) {
    if (!file.type.startsWith('image/')) {
        alert('Por favor, envie um arquivo de imagem válido.');
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            // Setup Workspace
            dropZone.classList.add('hidden');
            editorZone.classList.remove('hidden');
            processingOverlay.classList.remove('hidden');
            
            // Downscale image if too large (performance check)
            const maxDimension = 1200;
            let width = img.width;
            let height = img.height;

            if (width > maxDimension || height > maxDimension) {
                if (width > height) {
                    height = Math.round((height * maxDimension) / width);
                    width = maxDimension;
                } else {
                    width = Math.round((width * maxDimension) / height);
                    height = maxDimension;
                }
            }

            // Store active image downscaled
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = width;
            tempCanvas.height = height;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(img, 0, 0, width, height);

            activeImage = tempCanvas;

            // Trigger segmentation
            runSegmentation();
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

// Run ML segmentation
async function runSegmentation() {
    if (isSegmenting) return;
    isSegmenting = true;
    processingOverlay.classList.remove('hidden');

    try {
        if (!selfieSegmentation) {
            initModel();
        }
        await selfieSegmentation.send({ image: activeImage });
    } catch (error) {
        console.error("Erro ao processar segmentação:", error);
        alert("Ocorreu um erro ao identificar o fundo da imagem.");
        processingOverlay.classList.add('hidden');
        isSegmenting = false;
    }
}

// Callback when MediaPipe finishes
function onSegmentationResults(results) {
    segmentationMaskCanvas = results.segmentationMask;
    
    // Process effect on canvas
    applyEffect();

    processingOverlay.classList.add('hidden');
    isSegmenting = false;
}

// Composite background & foreground using GPU acceleration (Canvas Compositing)
function applyEffect() {
    if (!activeImage || !segmentationMaskCanvas) return;

    const width = activeImage.width;
    const height = activeImage.height;

    outputCanvas.width = width;
    outputCanvas.height = height;

    // Get current values
    const blur = parseInt(blurSlider.value);
    const threshold = parseFloat(thresholdSlider.value);
    const feather = parseInt(featherSlider.value);
    const saturation = parseInt(saturationSlider.value);

    // Update UI badge labels
    blurValue.textContent = `${blur}px`;
    thresholdValue.textContent = `${threshold}%`;
    featherValue.textContent = `${feather}px`;
    saturationValue.textContent = `${saturation}%`;

    // 1. Draw Background (blurred & grayscaled)
    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = width;
    bgCanvas.height = height;
    const bgCtx = bgCanvas.getContext('2d');
    
    let filterString = `grayscale(${100 - saturation}%)`;
    if (blur > 0) {
        filterString += ` blur(${blur}px)`;
    }
    bgCtx.filter = filterString;
    bgCtx.drawImage(activeImage, 0, 0, width, height);
    
    // Draw background on the final output canvas
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(bgCanvas, 0, 0);

    // 2. Prepare Mask Canvas (with Blur/Feather and Contrast/Threshold natively applied)
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskCtx = maskCanvas.getContext('2d');
    
    // Translate the threshold value (10-90) into contrast filter (e.g. 100% to 500%)
    const contrastVal = (threshold / 50) * 100;
    let maskFilter = '';
    if (feather > 0) {
        maskFilter += `blur(${feather}px) `;
    }
    maskFilter += `contrast(${contrastVal}%)`;
    
    maskCtx.filter = maskFilter;
    maskCtx.drawImage(segmentationMaskCanvas, 0, 0, width, height);

    // 3. Create Foreground Canvas (Original Color masked with the prepared Mask)
    const fgCanvas = document.createElement('canvas');
    fgCanvas.width = width;
    fgCanvas.height = height;
    const fgCtx = fgCanvas.getContext('2d');
    
    fgCtx.drawImage(activeImage, 0, 0);
    
    // Apply the mask: keeps only colored subject where mask is white
    fgCtx.globalCompositeOperation = 'destination-in';
    fgCtx.drawImage(maskCanvas, 0, 0);
    
    // 4. Draw Masked Foreground onto the final output canvas
    ctx.drawImage(fgCanvas, 0, 0);
}

// Live update sliders
blurSlider.addEventListener('input', applyEffect);
thresholdSlider.addEventListener('input', applyEffect);
featherSlider.addEventListener('input', applyEffect);
saturationSlider.addEventListener('input', applyEffect);

// Reset app
btnReset.addEventListener('click', () => {
    activeImage = null;
    segmentationMaskCanvas = null;
    fileInput.value = '';
    editorZone.classList.add('hidden');
    dropZone.classList.remove('hidden');
});

// Download processed image
btnDownload.addEventListener('click', () => {
    if (!outputCanvas.width) return;
    
    const link = document.createElement('a');
    link.download = 'colorpop-photo.png';
    link.href = outputCanvas.toDataURL('image/png');
    link.click();
});

// Initialize on page load
initModel();
