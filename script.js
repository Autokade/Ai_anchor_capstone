// script.js

// Ensure PIXI is loaded
if (typeof PIXI === 'undefined') {
    console.error('PIXI is not loaded');
    alert('PIXI library is not loaded. Check the HTML file.');
} else {
    console.log('PIXI is loaded successfully');
    window.PIXI = PIXI; // Expose PIXI globally
}

// Import MotionSync module for stream usage
// Ensure this path is correct relative to your HTML or use a reliable CDN
import { MotionSync } from 'https://cdn.jsdelivr.net/npm/live2d-motionsync@0.0.4/stream/+esm';
window.addEventListener('error', e => {
    if (e.message && e.message.includes('addLast')) e.preventDefault();
}, true);

// Debug loaded libraries after potential setup delays
setTimeout(() => {
    console.log('Checking libraries after short delay:');
    console.log('PIXI available:', !!window.PIXI);
    console.log('PIXI.live2d available:', !!(window.PIXI && window.PIXI.live2d));
    console.log('Live2DCubismCore available:', !!window.Live2DCubismCore);
}, 500);


// --- Constants ---
const DEFAULT_MODEL_PATH = "./models/kei_vowels_pro/kei_vowels_pro.model3.json"; // Your default model JSON path
const DEFAULT_MOTIONSYNC_PATH = "./models/kei_vowels_pro/kei_vowels_pro.motionsync3.json"; // Your default MotionSync JSON path
const BACKEND_URL_TTS = 'http://192.168.1.9:5001/tts'; // *** UPDATE THIS if your Edge TTS Flask server runs on a different port ***

// --- Global variables (Module-scoped) ---
let app; // PIXI Application instance
let model; // Live2D model instance
let motionSync; // MotionSync instance
let audioContext = null; // Web Audio API context
let currentAudioElement = null; // Current <audio> element for playback
let currentAudioURL = null; // Object URL for the current audio blob

// --- DOM Elements (Module-scoped, for core UI) ---
let statusElement;
let errorLogElement;

// --- Helper Functions ---
function updateStatus(message) {
    if (!statusElement) statusElement = document.getElementById('status');
    if (statusElement) {
        statusElement.textContent = `Status: ${message}`;
    }
    console.log(`[Status] ${message}`);
}
window.updateStatus = updateStatus; // Expose for chat.js

function showError(message) {
    if (!errorLogElement) errorLogElement = document.getElementById('error-log');
    if (errorLogElement) {
        // errorLogElement.style.display = 'block';
        const timestamp = new Date().toLocaleTimeString();
        errorLogElement.innerHTML += `[${timestamp}] ERROR: ${message}<br>`;
        errorLogElement.scrollTop = errorLogElement.scrollHeight;
    }
    console.error(`[Error] ${message}`);
}
window.showError = showError; // Expose for chat.js
// --- End Helper Functions ---

// Setup Live2D framework dependencies
const setupLive2D = () => {
    if (typeof Live2DCubismCore === 'undefined') {
        showError('Live2DCubismCore not found. Make sure live2dcubismcore.min.js is loaded.');
        return false;
    }
    if (!PIXI || !PIXI.live2d) {
        showError('PIXI.live2d not found. Make sure pixi.min.js and pixi-live2d-display*.js are loaded.');
        return false;
    }
    try {
        if (PIXI.live2d.Live2DModel.registerInteraction) {
             console.log('PIXI.live2d interaction already registered.');
        } else if (PIXI.live2d.cubism?.setup) {
             console.log('Attempting PIXI.live2d.cubism.setup()');
             PIXI.live2d.cubism.setup();
        } else if (PIXI.live2d.setup) {
             console.log('Attempting PIXI.live2d.setup()');
             PIXI.live2d.setup();
        } else {
             console.warn('No standard setup method found on PIXI.live2d.');
        }
    } catch (setupError) {
         showError(`Error during PIXI.live2d setup: ${setupError.message}`);
         console.error("PIXI.live2d Setup Error:", setupError);
         return false;
    }
     if (Live2DCubismCore && Live2DCubismCore.Version) {
         console.log(`Live2D Cubism Core Version: ${Live2DCubismCore.Version.toString()}`);
     }
     console.log("Live2D framework setup seems OK.");
    return true;
};

// Initialize PIXI Application
function initPixiApp() {
    if (app) return true;
    const canvas = document.getElementById('canvas');
    const container = document.getElementById('canvas-container');
    if (!canvas || !container) {
        showError('Canvas (#canvas) or container (#canvas-container) element not found in HTML.');
        return false;
    }
    try {
        app = new PIXI.Application({
            view: canvas,
            autoStart: true,
            backgroundAlpha: 0,
            resizeTo: container,
            antialias: true,
            resolution: window.devicePixelRatio || 1,
        });
        updateStatus('PIXI application initialized');
        console.log('PIXI App created:', app);
        return true;
    } catch (error) {
        showError(`Failed to initialize PIXI Application: ${error.message}`);
        console.error('PIXI Initialization Error:', error);
        return false;
    }
}

// Load the default Live2D model
async function loadDefaultModel() {
    updateStatus('Loading default model...');

    if (!app && !initPixiApp()) {
        showError('Failed to initialize PIXI App. Cannot load model.');
        return;
    }
    if (!setupLive2D()) {
         showError("Failed to setup Live2D framework. Cannot load model.");
         return;
    }

    updateStatus(`Attempting to load model from: ${DEFAULT_MODEL_PATH}`);

    try {
        if (model && model.parent) {
            app.stage.removeChild(model);
            model.destroy({ children: true });
            model = null;
            motionSync = null;
            console.log('Previous model removed.');
        }

        if (!PIXI.live2d || typeof PIXI.live2d.Live2DModel !== 'function') {
            showError("PIXI.live2d.Live2DModel is not available. Check PIXI Live2D Display library loading.");
            return;
        }

        model = await PIXI.live2d.Live2DModel.from(DEFAULT_MODEL_PATH, {
             autoInteract: false,
             autoUpdate: true
        });

        console.log("Model loaded:", model);
        if (!model.internalModel || !model.internalModel.coreModel) {
            throw new Error("Model loaded, but internal coreModel is missing.");
        }

        const container = document.getElementById('canvas-container');
        model.anchor.set(0.5, 0.5);

        const resizeModel = () => {
            if (!model || !container || !app || !app.renderer) return;
            model.x = container.clientWidth / 2;
            model.y = container.clientHeight * 0.5;
            const scaleFactor = Math.min(
                container.clientWidth / model.width,
                container.clientHeight / model.height
            ) * 1.2;
            model.scale.set(scaleFactor);
        };
        resizeModel();
        window.addEventListener('resize', resizeModel);
        app.stage.addChild(model);
        console.log('Model added to stage.');

        try {
            motionSync = new MotionSync(model.internalModel);
            console.log("MotionSync instance created successfully");
            await loadDefaultMotionSync();
        } catch (syncErr) {
            showError(`Failed to initialize MotionSync: ${syncErr.message}`);
            console.error("MotionSync initialization error:", syncErr);
        }

        updateStatus('Model ready.');
        // Chat.js will handle enabling/disabling its own inputs
        // Check if chat.js's UI elements are ready and if Ollama settings are present
        if (window.userInput) window.userInput.disabled = false; // Default enable
        if (window.sendButton) window.sendButton.disabled = false; // Default enable

    } catch (error) {
        showError(`Failed to load model: ${error.message}.`);
        console.error('Model Loading Error:', error);
        updateStatus('Error loading model.');
        if (window.userInput) window.userInput.disabled = true;
        if (window.sendButton) window.sendButton.disabled = true;
    }
}

// Load default motion sync configuration
async function loadDefaultMotionSync() {
    if (!motionSync) {
        showError('MotionSync not initialized. Cannot load configuration.');
        return;
    }
    updateStatus('Loading default motion sync config...');
    try {
        await motionSync.loadMotionSyncFromUrl(DEFAULT_MOTIONSYNC_PATH);
        updateStatus('Default motion sync config loaded successfully.');
        console.log(`MotionSync config loaded from ${DEFAULT_MOTIONSYNC_PATH}`);
    } catch (err) {
        showError(`Error loading motion sync from path (${DEFAULT_MOTIONSYNC_PATH}): ${err.message}.`);
        console.warn('Default MotionSync Load Error:', err);
    }
}

// Function to create or get AudioContext
function getAudioContext() {
    if (!audioContext || audioContext.state === 'closed') {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('AudioContext created.');
            const resumeContext = async () => {
                if (audioContext && audioContext.state === 'suspended') {
                    await audioContext.resume();
                    console.log('AudioContext resumed on user interaction.');
                }
                document.body.removeEventListener('click', resumeContext);
                document.body.removeEventListener('touchstart', resumeContext);
            };
             if (audioContext.state === 'suspended') {
                document.body.addEventListener('click', resumeContext, { once: true });
                document.body.addEventListener('touchstart', resumeContext, { once: true });
                console.log('AudioContext suspended. Waiting for user interaction to resume.');
             }
        } catch (e) {
            showError(`Error creating AudioContext: ${e.message}. Audio playback will not work.`);
            console.error('AudioContext creation failed:', e);
            return null;
        }
    }
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume().catch(err => console.warn("Failed to resume suspended AudioContext:", err));
    }
    return audioContext;
}

// Speak text using the Edge TTS backend and sync lips with MotionSync
async function speakText(textToSpeak) {
    console.log('[SpeakText] Received request to speak:', textToSpeak);

    if (!model) {
        showError('Cannot speak: Model not loaded yet.');
        console.error('[SpeakText] Model not loaded.');
        stopSpeaking();
        return;
    }
    if (!motionSync) {
        showError('Cannot speak: MotionSync not initialized. Lip-sync unavailable.');
        console.warn('[SpeakText] MotionSync not initialized.');
    }

    if (!textToSpeak || textToSpeak.trim() === "") {
        console.log("[SpeakText] Called with empty or whitespace-only text. Skipping speech and resetting UI.");
        stopSpeaking();
        return;
    }

    stopSpeaking(false);
    updateStatus('Requesting TTS audio from backend...');
    if (window.sendButton) window.sendButton.disabled = true;
    if (window.userInput) window.userInput.disabled = true;

    try {
        console.log(`[SpeakText] Sending text to TTS backend (${BACKEND_URL_TTS}): "${textToSpeak.substring(0, 100)}..."`);
        const response = await fetch(BACKEND_URL_TTS, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', },
            body: JSON.stringify({ text: textToSpeak }),
        });

        console.log(`[SpeakText] TTS Backend Response Status: ${response.status} ${response.statusText}`);
        if (!response.ok) {
            let errorDetail = `Backend returned status ${response.status} ${response.statusText}`;
            const responseContentType = response.headers.get("content-type");
            console.error(`[SpeakText] TTS Backend error. Content-Type: ${responseContentType}`);
            try {
                if (responseContentType && responseContentType.includes("application/json")) {
                    const errorData = await response.json();
                    errorDetail += ` - ${errorData.error || JSON.stringify(errorData)}`;
                    console.error('[SpeakText] TTS Backend JSON error:', errorData);
                } else {
                    const textError = await response.text();
                    errorDetail += ` - Raw response: ${textError.substring(0, 500)}...`;
                    console.error('[SpeakText] TTS Backend text error:', textError.substring(0,500));
                }
            } catch (e) {
                console.error('[SpeakText] Failed to parse TTS error response body:', e);
                errorDetail += ' (Failed to parse error response body)';
            }
            throw new Error(`Backend TTS failed: ${errorDetail}`);
        }

        const audioBlob = await response.blob();
        if (!audioBlob || audioBlob.size === 0) {
             console.error("[SpeakText] Received empty audio data from backend.", audioBlob);
             throw new Error("Received empty audio data from backend.");
        }
        console.log(`[SpeakText] Received audio blob: ${audioBlob.size} bytes, type: ${audioBlob.type}`);
        if (!audioBlob.type.startsWith('audio/')) {
            console.warn(`[SpeakText] Received blob is not an audio type: ${audioBlob.type}. Playback might fail.`);
        }

        const localAudioContext = getAudioContext();
        if (!localAudioContext) {
            console.error("[SpeakText] Failed to initialize AudioContext.");
            throw new Error("Failed to initialize AudioContext. Cannot play audio.");
        }
        console.log(`[SpeakText] AudioContext state: ${localAudioContext.state}`);

        currentAudioElement = new Audio();
        currentAudioURL = URL.createObjectURL(audioBlob);
        currentAudioElement.src = currentAudioURL;
        currentAudioElement.preload = 'auto';
        updateStatus('Audio received, preparing playback...');
        console.log('[SpeakText] Audio element created, src set.');

        await new Promise((resolve, reject) => {
            currentAudioElement.onloadedmetadata = async () => {
                console.log('[SpeakText] Audio metadata loaded. Duration:', currentAudioElement.duration);
                if (isNaN(currentAudioElement.duration) || currentAudioElement.duration === Infinity) {
                     console.warn("[SpeakText] Audio duration is invalid. Playback might be problematic.");
                }
                try {
                    const sourceNode = localAudioContext.createMediaElementSource(currentAudioElement);
                    const destinationNode = localAudioContext.createMediaStreamDestination();
                    sourceNode.connect(destinationNode);
                    sourceNode.connect(localAudioContext.destination);
                    const mediaStream = destinationNode.stream;
                    console.log('[SpeakText] Web Audio graph set up. MediaStream created:', mediaStream);

                    if (motionSync) {
                         updateStatus('Starting MotionSync...');
                         try {
                            await motionSync.play(mediaStream);
                            console.log('[SpeakText] MotionSync play() called.');
                         } catch (motionSyncError) {
                             showError(`MotionSync play() failed: ${motionSyncError.message}`);
                             console.error("[SpeakText] MotionSync play() error:", motionSyncError);
                         }
                    } else {
                         console.warn("[SpeakText] MotionSync not available, proceeding without lip-sync.");
                    }
                    updateStatus('Playing audio...');
                    console.log('[SpeakText] Attempting to play audio element...');
                    currentAudioElement.play()
                        .then(() => {
                            console.log('[SpeakText] Audio playback started via element.play().');
                            updateStatus('Speaking...');
                            resolve();
                        })
                        .catch(playError => {
                            showError(`Audio play() failed: ${playError.message}. User interaction might be needed.`);
                            console.error("[SpeakText] audioElement.play() error:", playError);
                            reject(playError);
                        });
                } catch (err) {
                    showError(`Error setting up audio stream or MotionSync: ${err.message}`);
                    console.error("[SpeakText] Audio Setup/MotionSync Error during onloadedmetadata:", err);
                    reject(err);
                }
            };

            currentAudioElement.onerror = (e) => {
                 const errorMsg = currentAudioElement.error ? `${currentAudioElement.error.message} (code: ${currentAudioElement.error.code})` : 'Unknown audio element error';
                 showError(`Audio Element Error: ${errorMsg}`);
                 console.error("[SpeakText] Audio Element Playback Error Event:", e, "Specific error:", currentAudioElement.error);
                 reject(new Error(`Audio Element Error: ${errorMsg}`));
            };
             currentAudioElement.onstalled = () => {
                 console.warn("[SpeakText] Audio playback stalled.");
                 updateStatus("Audio stalled...");
             };
             currentAudioElement.onwaiting = () => {
                 console.log("[SpeakText] Audio waiting for data...");
                 updateStatus("Buffering audio...");
             };
              currentAudioElement.onplaying = () => {
                 console.log("[SpeakText] Audio is actively playing.");
                 updateStatus("Speaking...");
             };
             currentAudioElement.onended = () => { // Moved onended inside the promise chain setup
                console.log('[SpeakText] Audio playback finished (onended).');
                updateStatus('Speech completed.');
                stopSpeaking(); // This will re-enable UI
            };
        });
        // Note: onended is now handled within the Promise setup to ensure it's set before playback potentially finishes quickly.

    } catch (error) {
        showError(`Error during TTS or playback: ${error.message}`);
        console.error('[SpeakText] Overall SpeakText Error:', error);
        updateStatus('Error during speech.');
        stopSpeaking(); // Ensure UI reset even on error
    }
}


// Stop speaking, clean up audio resources, and reset UI state
function stopSpeaking(updateUI = true) {
    console.log('[StopSpeaking] Called. updateUI:', updateUI);

    if (currentAudioElement) {
        console.log('[StopSpeaking] Pausing and cleaning up currentAudioElement.');
        currentAudioElement.pause();
        if (currentAudioElement.src) { // Only if src was set
            currentAudioElement.removeAttribute('src'); // Remove source reference
        }
        currentAudioElement.load(); // Attempt to reset state
        currentAudioElement.onloadedmetadata = null;
        currentAudioElement.onerror = null;
        currentAudioElement.onended = null;
        currentAudioElement.onstalled = null;
        currentAudioElement.onwaiting = null;
        currentAudioElement.onplaying = null;
        currentAudioElement = null;
    }
    if (currentAudioURL) {
        console.log('[StopSpeaking] Revoking currentAudioURL.');
        URL.revokeObjectURL(currentAudioURL);
        currentAudioURL = null;
    }

   if (motionSync) {
    try {
        motionSync.reset();
    } catch(e) {}
}

    if (updateUI) {
        console.log('[StopSpeaking] Updating UI elements.');
        const modelInstance = window.debug && typeof window.debug.model === 'function' ? window.debug.model() : null;
        const canInteract = !!modelInstance;

        // Access chat UI elements via window as they are global in chat.js
        if (window.sendButton) window.sendButton.disabled = !canInteract;
        if (window.userInput) window.userInput.disabled = !canInteract;

        if (!modelInstance) {
             updateStatus('Model not loaded.');
        } else {
             updateStatus('Ready for input.');
        }
    } else {
        console.log('[StopSpeaking] UI update skipped (updateUI=false).');
    }
}


// --- Initialization (Core part) ---
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded and parsed (script.js).');

    statusElement = document.getElementById('status');
    errorLogElement = document.getElementById('error-log');

    if (!statusElement || !errorLogElement || !document.getElementById('canvas') || !document.getElementById('canvas-container')) {
         showError("One or more required HTML elements (status, error-log, canvas, canvas-container) are missing.");
         alert("Critical HTML elements missing. Application cannot start correctly.");
         return;
    }

    updateStatus('Initializing core systems...');
    initPixiApp();
    loadDefaultModel();

    window.addEventListener('error', function(event) {
        showError(`Unhandled error: ${event.message} at ${event.filename}:${event.lineno}`);
        console.error("Unhandled Global Error:", event.error, event);
    });
    window.addEventListener('unhandledrejection', function(event) {
         showError(`Unhandled promise rejection: ${event.reason?.message || event.reason}`);
         console.error("Unhandled Promise Rejection:", event.reason);
    });

     console.log("Core initialization complete.");
});

// Expose key functions to global scope for debugging and for chat.js
window.debug = {
    app: () => app,
    model: () => model,
    motionSync: () => motionSync,
    speak: speakText,
    stop: stopSpeaking,
    context: () => audioContext,
    reloadModel: loadDefaultModel,
    checkLibs: () => {
        console.log('PIXI:', typeof PIXI, PIXI?.VERSION);
        console.log('PIXI.live2d:', typeof PIXI?.live2d, PIXI?.live2d?.VERSION);
        console.log('Live2DCubismCore:', typeof Live2DCubismCore, Live2DCubismCore?.Version?.toString());
        console.log('MotionSync:', typeof MotionSync);
        console.log('KaTeX:', typeof katex);
        console.log('Prism:', typeof Prism);
    }
};
