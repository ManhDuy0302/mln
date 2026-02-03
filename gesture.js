// ==========================================
// GESTURE.JS - Hand Gesture Control Module
// Lazy loaded only when Gesture Mode is activated
// ==========================================

// ==========================================
// GESTURE VARIABLES (shared with main script)
// ==========================================
// These variables are defined in script.js and shared:
// - leftHand, rightHand
// - prevPanPos, isHandActive
// - cursorEnabled, cursorX, cursorY, cursorTargetX, cursorTargetY
// - scrollVelocity, targetZoom, targetPan
// - lastSwipeTime, lastBackTime
// - controlMode, currentGestureContext, GESTURE_CONTEXT
// - isInDetailView, currentActiveCard
// - hoveredNode, nodeMeshes, camera, renderer
// - CONFIG

// MediaPipe instances
let handsInstance = null;
let cameraInstance = null;
let isMediaPipeRunning = false;

// ==========================================
// FINGER DETECTION UTILITIES
// ==========================================
function isFingerExtended(landmarks, fingerTip, fingerPIP) {
    const wrist = landmarks[0];
    const tipDist = Math.hypot(landmarks[fingerTip].x - wrist.x, landmarks[fingerTip].y - wrist.y);
    const pipDist = Math.hypot(landmarks[fingerPIP].x - wrist.x, landmarks[fingerPIP].y - wrist.y);
    return tipDist > pipDist * 1.1;
}

function countExtendedFingers(landmarks) {
    return {
        index: isFingerExtended(landmarks, 8, 6),
        middle: isFingerExtended(landmarks, 12, 10),
        ring: isFingerExtended(landmarks, 16, 14),
        pinky: isFingerExtended(landmarks, 20, 18)
    };
}

function getPinchDistance(landmarks) {
    return Math.hypot(
        landmarks[4].x - landmarks[8].x,
        landmarks[4].y - landmarks[8].y
    );
}

function isOpenHand(landmarks) {
    const fingers = countExtendedFingers(landmarks);
    const thumbTip = landmarks[4];
    const indexBase = landmarks[5];
    const thumbExtended = Math.hypot(thumbTip.x - indexBase.x, thumbTip.y - indexBase.y) > 0.1;
    return thumbExtended && fingers.index && fingers.middle && fingers.ring && fingers.pinky;
}

function isPointingFinger(landmarks) {
    const fingers = countExtendedFingers(landmarks);
    return fingers.index && !fingers.middle && !fingers.ring && !fingers.pinky;
}

// ==========================================
// PROCESS HANDS - MAIN ENTRY POINT
// ==========================================
// Track consecutive frames without hands (for smooth fade-out)
let framesWithoutHands = 0;
const HAND_LOST_THRESHOLD = 3; // Wait 3 frames before resetting (reduces flickering)

function processHands(results) {
    if (controlMode !== 'gesture') return;

    // Temporarily store detected hands
    let detectedLeftHand = null;
    let detectedRightHand = null;

    if (results.multiHandLandmarks && results.multiHandedness) {
        results.multiHandLandmarks.forEach((landmarks, i) => {
            const handedness = results.multiHandedness[i].label;
            if (handedness === 'Left') {
                detectedRightHand = landmarks;
            } else {
                detectedLeftHand = landmarks;
            }
        });
    }

    // Smooth hand detection with threshold (prevents flickering)
    if (!detectedLeftHand && !detectedRightHand) {
        framesWithoutHands++;

        if (framesWithoutHands >= HAND_LOST_THRESHOLD) {
            // Actually lost hands - reset state
            leftHand = null;
            rightHand = null;
            prevPanPos = null;
            isHandActive = false;
            framesWithoutHands = 0;
        }
        // Otherwise keep last known hand state for smooth transitions
        return;
    }

    // Hands detected - update state
    framesWithoutHands = 0;
    leftHand = detectedLeftHand;
    rightHand = detectedRightHand;
    isHandActive = true;

    // Context-aware handling
    if (currentGestureContext === GESTURE_CONTEXT.CAROUSEL) {
        if (leftHand) handleLeftCarousel(leftHand);
        if (rightHand) handleRightHand(rightHand);
    }
    else if (currentGestureContext === GESTURE_CONTEXT.DETAIL) {
        if (leftHand) handleLeftDetail(leftHand);
        if (rightHand) handleRightHand(rightHand);
    }
    else if (currentGestureContext === GESTURE_CONTEXT.TIMELINE) {
        if (leftHand) handleLeftTimeline(leftHand);
        if (rightHand) handleRightHand(rightHand);
    }
    // ⭐ CONCLUSION context - scroll nội dung kết luận
    else if (currentGestureContext === GESTURE_CONTEXT.CONCLUSION) {
        if (leftHand) handleLeftConclusion(leftHand);
        if (rightHand) handleRightHand(rightHand);
    }
}

// ==========================================
// RIGHT HAND - CURSOR + ACTIONS
// ==========================================
function handleRightHand(landmarks) {
    const index = landmarks[8];
    const middle = landmarks[12];
    const ring = landmarks[16];
    const pinky = landmarks[20];
    const thumb = landmarks[4];

    const fingers = {
        index: index.y < landmarks[6].y,
        middle: middle.y < landmarks[10].y,
        ring: ring.y < landmarks[14].y,
        pinky: pinky.y < landmarks[18].y
    };

    // Thumb extended detection - more lenient threshold
    const thumbExtended = Math.hypot(thumb.x - landmarks[5].x, thumb.y - landmarks[5].y) > 0.08;

    // Fist: all 4 fingers closed
    const isFistGesture = !fingers.index && !fingers.middle && !fingers.ring && !fingers.pinky;

    // 👍 Like/Thumb Up: thumb extended + index closed only (very lenient)
    const isThumbUp = thumbExtended && !fingers.index;

    // 🖖 3 NGÓN → Back theo context
    if (fingers.index && fingers.middle && fingers.ring && !fingers.pinky) {
        const now = Date.now();
        if (now - lastBackTime < CONFIG.BACK_COOLDOWN) return '🖖 ĐANG CHỜ...';
        lastBackTime = now;

        // ⭐ Thêm xử lý back từ CONCLUSION
        if (currentGestureContext === GESTURE_CONTEXT.CONCLUSION) {
            closeConclusionOverlay();
            return '🖖 BACK: Conclusion → Timeline';
        } else if (currentGestureContext === GESTURE_CONTEXT.DETAIL) {
            exitDetailView();
            return '🖖 BACK: Detail → Timeline';
        } else if (currentGestureContext === GESTURE_CONTEXT.TIMELINE) {
            exitTimelineView();
            return '🖖 BACK: Timeline → Carousel';
        } else if (currentGestureContext === GESTURE_CONTEXT.CAROUSEL) {
            resetToWelcome();
            return '🖖 BACK: Carousel → Welcome';
        }
        return '🖖 3 NGÓN: KHÔNG CÓ ACTION';
    }

    // ✊ NẮM ĐẤM → Zoom Out (Timeline only)
    if (isFistGesture && currentGestureContext === GESTURE_CONTEXT.TIMELINE) {
        targetZoom = Math.max(CONFIG.zoomMin, targetZoom - CONFIG.ZOOM_OUT_SPEED);
        return '✊ NẮM ĐẤM: ZOOM OUT';
    }

    // 👍 NGÓN CÁI → Zoom In (Timeline only)
    if (isThumbUp && currentGestureContext === GESTURE_CONTEXT.TIMELINE) {
        targetZoom = Math.min(CONFIG.zoomMax, targetZoom + CONFIG.ZOOM_IN_SPEED);
        return '👍 NGÓN CÁI: ZOOM IN';
    }

    // ✌️ 2 NGÓN → Chọn thẻ (Carousel) / Vào node (Timeline)
    if (fingers.index && fingers.middle && !fingers.ring && !fingers.pinky) {
        // Trong Carousel: chọn thẻ hiện tại
        if (currentGestureContext === GESTURE_CONTEXT.CAROUSEL) {
            const now = Date.now();
            if (now - lastBackTime < 800) return '✌️ ĐANG CHỜ...'; // Cooldown
            lastBackTime = now;

            // Chọn thẻ đang active (currentCardIndex + 1 vì cardId bắt đầu từ 1)
            const cardId = currentCardIndex + 1;
            selectCard(cardId);
            return `✌️ 2 NGÓN: CHỌN THẺ ${cardId}`;
        }
        // Trong Timeline: chọn node
        return selectOrEnterNode();
    }

    // ☝️ NGÓN TRỎ → Di chuyển cursor
    if (fingers.index && !fingers.middle && !fingers.ring && !fingers.pinky) {
        moveCursor(index);
        return '☝️ NGÓN TRỎ: DI CHUYỂN CURSOR';
    }

    if (fingers.index) {
        moveCursor(index);
    }

    return '';
}

// ==========================================
// LEFT HAND HANDLERS
// ==========================================
function handleLeftDetail(landmarks) {
    if (isOpenHand(landmarks)) {
        const palm = landmarks[9];
        if (!prevPanPos) {
            prevPanPos = palm;
            return;
        }
        const dy = palm.y - prevPanPos.y;
        scrollVelocity = dy * 25;
        prevPanPos = palm;
        return;
    }
    prevPanPos = null;
}

// ⭐ Scroll nội dung Kết luận bằng tay trái
function handleLeftConclusion(landmarks) {
    if (isOpenHand(landmarks)) {
        const palm = landmarks[9];
        if (!prevPanPos) {
            prevPanPos = palm;
            return;
        }
        const dy = palm.y - prevPanPos.y;

        // Scroll conclusion container
        const container = document.getElementById('conclusion-container');
        if (container) {
            container.scrollTop += dy * 800;
        }

        prevPanPos = palm;
        return;
    }
    prevPanPos = null;
}

function handleLeftTimeline(landmarks) {
    if (!isOpenHand(landmarks)) {
        prevPanPos = null;
        return;
    }
    const palm = landmarks[9];
    if (!prevPanPos) {
        prevPanPos = palm;
        return;
    }
    targetPan.x += (prevPanPos.x - palm.x) * 200;
    targetPan.y += (palm.y - prevPanPos.y) * 150;
    prevPanPos = palm;
}

function handleLeftCarousel(landmarks) {
    if (!isOpenHand(landmarks)) {
        prevPanPos = null;
        return;
    }
    const palm = landmarks[9];
    if (!prevPanPos) {
        prevPanPos = palm;
        return;
    }

    const dx = palm.x - prevPanPos.x;
    const now = Date.now();

    // Cooldown 500ms để vuốt liên tục
    if (now - lastSwipeTime < 500) {
        prevPanPos = palm;
        return;
    }

    // Threshold 0.08 để nhạy
    if (Math.abs(dx) > 0.05) {
        // dx > 0: vuốt sang phải → next card (1)
        // dx < 0: vuốt sang trái → prev card (-1)
        const direction = dx > 0 ? 1 : -1;
        navigateCards(direction);
        lastSwipeTime = now;

        // Reset để cho phép vuốt tiếp
        prevPanPos = null;

        // Visual feedback
        const container = document.getElementById('node-cards-container');
        container.classList.add('swipe-shake');
        setTimeout(() => container.classList.remove('swipe-shake'), 300);
    } else {
        prevPanPos = palm;
    }
}

// ==========================================
// CURSOR MOVEMENT
// ==========================================
// Camera Zone Mapping
// Chỉ dùng vùng giữa camera để map ra toàn màn hình
// Config: CONFIG.CAMERA_MARGIN trong data.js

// Edge scroll state
let edgeScrollActive = false;
let lastEdgeScrollTime = 0;
const EDGE_SCROLL_INTERVAL = 100; // ms giữa mỗi lần auto-scroll

function getMargin() {
    return (typeof CONFIG !== 'undefined' && CONFIG.CAMERA_MARGIN)
        ? CONFIG.CAMERA_MARGIN
        : 0.2;
}

function mapCameraToScreen(rawValue) {
    const margin = getMargin();

    // Map từ vùng [margin, 1-margin] → [0, 1]
    // Ví dụ với margin=0.25: 0.25 → 0, 0.5 → 0.5, 0.75 → 1
    const mapped = (rawValue - margin) / (1 - 2 * margin);

    // Clamp để không vượt quá 0-1
    return Math.max(0, Math.min(1, mapped));
}

// Kiểm tra và xử lý edge scrolling khi ngón tay chạm margin
function handleEdgeScroll(rawX, rawY) {
    const margin = getMargin();
    const now = Date.now();

    // Throttle edge scroll
    if (now - lastEdgeScrollTime < EDGE_SCROLL_INTERVAL) return;

    // Detect edge zones (trong vùng margin)
    // Lưu ý: Camera bị mirror nên trái/phải đảo ngược
    const inLeftEdge = rawX > (1 - margin);   // Tay bên phải camera = trái màn hình
    const inRightEdge = rawX < margin;         // Tay bên trái camera = phải màn hình
    const inTopEdge = rawY < margin;
    const inBottomEdge = rawY > (1 - margin);

    // ⭐ Tính tốc độ scroll với EXPONENTIAL EASING
    // Càng xa khỏi biên (sâu vào margin) → tốc độ tăng NHANH hơn (bậc 2)
    // depth: 0 (vừa chạm edge) → 1 (sát mép camera)
    // speed: minSpeed → maxSpeed (theo curve exponential)
    const calcSpeed = (value, threshold, minSpeed, maxSpeed) => {
        // Tính độ sâu vào margin (0 = vừa chạm, 1 = sát mép camera)
        const depth = Math.abs(value - threshold) / margin;
        // Clamp depth từ 0-1
        const clampedDepth = Math.min(1, Math.max(0, depth));
        // Exponential easing: depth^2 để tăng tốc mạnh hơn khi sâu hơn
        const easedDepth = clampedDepth * clampedDepth;
        // Map từ minSpeed đến maxSpeed
        return minSpeed + easedDepth * (maxSpeed - minSpeed);
    };

    let scrolled = false;

    // === CONTEXT: TIMELINE (Pan camera) ===
    if (currentGestureContext === GESTURE_CONTEXT.TIMELINE && !isInDetailView) {
        const PAN_MIN = 2;   // Tốc độ tối thiểu (vừa chạm edge)
        const PAN_MAX = 20;  // Tốc độ tối đa (sát mép camera)

        if (inLeftEdge) {
            const speed = calcSpeed(rawX, 1 - margin, PAN_MIN, PAN_MAX);
            targetPan.x -= speed;
            scrolled = true;
        }
        if (inRightEdge) {
            const speed = calcSpeed(rawX, margin, PAN_MIN, PAN_MAX);
            targetPan.x += speed;
            scrolled = true;
        }
        if (inTopEdge) {
            const speed = calcSpeed(rawY, margin, PAN_MIN, PAN_MAX);
            targetPan.y += speed;
            scrolled = true;
        }
        if (inBottomEdge) {
            const speed = calcSpeed(rawY, 1 - margin, PAN_MIN, PAN_MAX);
            targetPan.y -= speed;
            scrolled = true;
        }
    }

    // === CONTEXT: CAROUSEL (Navigate cards) ===
    if (currentGestureContext === GESTURE_CONTEXT.CAROUSEL) {
        // Chỉ xử lý trái/phải, với cooldown dài hơn để tránh lướt quá nhanh
        if (now - lastEdgeScrollTime < 400) return;

        if (inLeftEdge) {
            navigateCards(-1); // Previous card
            scrolled = true;
        }
        if (inRightEdge) {
            navigateCards(1);  // Next card
            scrolled = true;
        }
    }

    // === CONTEXT: DETAIL (Scroll content) ===
    if (currentGestureContext === GESTURE_CONTEXT.DETAIL) {
        const SCROLL_MIN = 3;   // Tốc độ tối thiểu
        const SCROLL_MAX = 25;  // Tốc độ tối đa (sát mép = cuộn rất nhanh)

        if (inTopEdge) {
            const speed = calcSpeed(rawY, margin, SCROLL_MIN, SCROLL_MAX);
            scrollVelocity = -speed;
            scrolled = true;
        }
        if (inBottomEdge) {
            const speed = calcSpeed(rawY, 1 - margin, SCROLL_MIN, SCROLL_MAX);
            scrollVelocity = speed;
            scrolled = true;
        }
    }

    if (scrolled) {
        lastEdgeScrollTime = now;
        edgeScrollActive = true;
    } else {
        edgeScrollActive = false;
    }
}

function moveCursor(indexFingerLandmark) {
    const cursor = document.getElementById('virtual-cursor');
    if (!cursorEnabled) {
        cursorEnabled = true;
        cursor.style.display = 'block';
    }

    // Lưu raw values để detect edge
    const rawX = indexFingerLandmark.x;
    const rawY = indexFingerLandmark.y;

    // Map từ vùng giữa camera ra toàn màn hình
    const normalizedX = mapCameraToScreen(rawX);
    const normalizedY = mapCameraToScreen(rawY);

    // Mirror X vì camera bị lật ngang (selfie mode)
    cursorTargetX = (1 - normalizedX) * window.innerWidth;
    cursorTargetY = normalizedY * window.innerHeight;

    // ⭐ Edge scrolling: khi ngón tay chạm margin, tự động lướt
    handleEdgeScroll(rawX, rawY);

    // ⭐ MỚI: Truyền tọa độ mượt (cursorX, cursorY) thay vì tọa độ target
    checkNodeHover(cursorX, cursorY);

    // Visual feedback khi edge scrolling
    cursor.classList.toggle('active', !!hoveredNode || hoveredHTMLButton);
    cursor.classList.toggle('edge-scrolling', edgeScrollActive);
}

// ==========================================
// NODE SELECTION
// ==========================================
function selectOrEnterNode() {
    if (!cursorX || !cursorY) {
        return '✌️ 2 NGÓN: DI CHUYỂN CURSOR ĐẾN NODE';
    }

    if (hoveredHTMLButton) {
        const btn = hoveredHTMLButton.tagName === 'BUTTON' ? hoveredHTMLButton : hoveredHTMLButton.closest('button');
        console.log('🎯 GESTURE CLICK:', btn.id, btn.textContent.trim());

        // Visual feedback for clicking
        const cursor = document.getElementById('virtual-cursor');
        cursor.classList.add('clicking');
        setTimeout(() => cursor.classList.remove('clicking'), 300);

        btn.click();
        return `✌️ 2 NGÓN: CLICK BUTTON "${btn.textContent.trim()}"`;
    }

    const cursor = document.getElementById('virtual-cursor');
    cursor.classList.add('clicking');
    setTimeout(() => cursor.classList.remove('clicking'), 300);

    const rect = renderer.domElement.getBoundingClientRect();
    const x = (cursorX / rect.width) * 2 - 1;
    const y = -(cursorY / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera({ x, y }, camera);
    const intersects = raycaster.intersectObjects(nodeMeshes);

    if (intersects.length > 0) {
        const node = intersects[0].object.userData;
        if (isInDetailView) {
            return '✌️ 2 NGÓN: TRONG CHI TIẾT';
        } else {
            const nodeMesh = nodeMeshes.find(m => m.userData.id === node.id);
            animateNodeZoom(nodeMesh, () => {
                openDetailView(node);
            });
            return `✌️ 2 NGÓN: MỞ "${node.title || node.label}"`;
        }
    }
    return '✌️ 2 NGÓN: KHÔNG CÓ NODE';
}

let hoveredHTMLButton = null;

function checkNodeHover(screenX, screenY) {
    // 1. Kiểm tra HTML Buttons trước (ưu tiên UI)
    // Lưu ý: Dùng Math.round để tránh lỗi tọa độ float trong một số trình duyệt
    const elements = document.elementsFromPoint(Math.round(screenX), Math.round(screenY));
    const newHoveredHTMLButton = elements.find(el => (el.tagName === 'BUTTON' || el.closest('button')) && el.id !== 'virtual-cursor');

    // ⭐ MỚI: Quản lý class gesture-hover để tạo hiệu ứng nhô lên/glow
    if (newHoveredHTMLButton !== hoveredHTMLButton) {
        // Xóa class cũ
        if (hoveredHTMLButton) {
            const oldTarget = hoveredHTMLButton.tagName === 'BUTTON' ? hoveredHTMLButton : hoveredHTMLButton.closest('button');
            oldTarget.classList.remove('gesture-hover');
        }
        // Thêm class mới
        if (newHoveredHTMLButton) {
            const newTarget = newHoveredHTMLButton.tagName === 'BUTTON' ? newHoveredHTMLButton : newHoveredHTMLButton.closest('button');
            newTarget.classList.add('gesture-hover');
        }
        hoveredHTMLButton = newHoveredHTMLButton;
    }

    if (hoveredHTMLButton) {
        hoveredNode = null;
        document.body.style.cursor = 'pointer';
        return;
    }

    // 2. Kiểm tra 3D Nodes
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(
        (screenX / window.innerWidth) * 2 - 1,
        -(screenY / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(nodeMeshes);
    hoveredNode = intersects.length > 0 ? intersects[0].object.userData : null;

    if (hoveredNode) {
        document.body.style.cursor = 'pointer';
    } else {
        document.body.style.cursor = 'default';
    }
}

// ==========================================
// MEDIAPIPE INITIALIZATION
// ==========================================
// Throttle for processHands (reduce lag)
let lastProcessTime = 0;
const PROCESS_INTERVAL = 50; // Process every 50ms (20 FPS for gestures)

// Track initialization state
let isMediaPipeInitializing = false;

async function startMediaPipe() {
    // Prevent double initialization
    if (isMediaPipeRunning) {
        console.log('⚠️ MediaPipe already running');
        return;
    }

    if (isMediaPipeInitializing) {
        console.log('⚠️ MediaPipe is initializing...');
        return;
    }

    isMediaPipeInitializing = true;

    const video = document.querySelector('.input_video');
    const canvas = document.getElementById('camera-preview');
    const ctx = canvas.getContext('2d');

    // REUSE: Only create instance if not exists
    if (!handsInstance) {
        console.log('🔧 Creating Hands instance...');
        handsInstance = new Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        handsInstance.setOptions({
            maxNumHands: 2,
            modelComplexity: 0,
            minDetectionConfidence: 0.6,  // Giảm để phát hiện nhanh hơn
            minTrackingConfidence: 0.4    // Giảm để tracking mượt hơn
        });

        handsInstance.onResults((results) => {
            if (!isMediaPipeRunning) return;

            // Throttle processing to reduce lag
            const now = Date.now();
            if (now - lastProcessTime < PROCESS_INTERVAL) {
                // Still draw camera preview even when throttled
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
                return;
            }
            lastProcessTime = now;

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

            if (results.multiHandLandmarks) {
                results.multiHandLandmarks.forEach(landmarks => {
                    [4, 8, 12, 16, 20].forEach(tip => {
                        ctx.beginPath();
                        ctx.arc(landmarks[tip].x * canvas.width, landmarks[tip].y * canvas.height, 4, 0, Math.PI * 2);
                        ctx.fillStyle = '#FFD700';
                        ctx.fill();
                    });
                });
            }

            // Process gestures in all contexts now
            processHands(results);
        });
    }

    if (!cameraInstance) {
        console.log('🔧 Creating Camera instance...');
        cameraInstance = new Camera(video, {
            onFrame: async () => {
                if (isMediaPipeRunning && handsInstance) {
                    try {
                        await handsInstance.send({ image: video });
                    } catch (e) {
                        // Silently ignore send failures to reduce console spam
                    }
                }
            },
            width: 320,
            height: 240
        });
    }

    try {
        await cameraInstance.start();
        isMediaPipeRunning = true;
        isMediaPipeInitializing = false;
        console.log('✅ MediaPipe started successfully');
    } catch (err) {
        console.error('❌ Camera start failed:', err);
        isMediaPipeRunning = false;
        isMediaPipeInitializing = false;

        // Show user-friendly error
        alert('⚠️ Cần cấp quyền Camera để sử dụng chế độ cử chỉ tay!\n\nVui lòng:\n1. Nhấn vào biểu tượng camera trên thanh địa chỉ\n2. Chọn "Cho phép" (Allow)\n3. Tải lại trang');
    }
}

function stopMediaPipe() {
    console.log('⏹️ Stopping MediaPipe...');
    isMediaPipeRunning = false;
    isMediaPipeInitializing = false;

    if (cameraInstance) {
        cameraInstance.stop();
    }

    // Reset gesture states to prevent stale data
    resetGestureState();

    // Note: Don't close handsInstance completely as it causes WASM re-init errors
    // Just stop processing frames by setting isMediaPipeRunning = false
    console.log('⏹️ MediaPipe components paused');
}

// Reset all gesture-related state
function resetGestureState() {
    leftHand = null;
    rightHand = null;
    prevPanPos = null;
    isHandActive = false;
    lastProcessTime = 0;

    // Reset cursor state but keep it visible if enabled
    if (cursorEnabled) {
        cursorTargetX = window.innerWidth / 2;
        cursorTargetY = window.innerHeight / 2;
    }

    console.log('🔄 Gesture state reset');
}

// Quick restart MediaPipe (for context switching)
async function restartMediaPipe() {
    if (controlMode !== 'gesture') return;

    console.log('🔄 Restarting MediaPipe...');

    // If already running, just reset state
    if (isMediaPipeRunning) {
        resetGestureState();
        return;
    }

    // If not running, start it
    await startMediaPipe();
}

// ==========================================
// EXPORT (for debugging)
// ==========================================
console.log('✅ gesture.js loaded');
