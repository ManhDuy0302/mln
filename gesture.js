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
function processHands(results) {
    if (controlMode !== 'gesture') return;

    leftHand = null;
    rightHand = null;

    if (results.multiHandLandmarks && results.multiHandedness) {
        results.multiHandLandmarks.forEach((landmarks, i) => {
            const handedness = results.multiHandedness[i].label;
            if (handedness === 'Left') {
                rightHand = landmarks;
            } else {
                leftHand = landmarks;
            }
        });
    }

    // Reset state when hands lost (Fixes jumping issue)
    if (!leftHand && !rightHand) {
        prevPanPos = null;
        isHandActive = false;
        return;
    }
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

        if (currentGestureContext === GESTURE_CONTEXT.DETAIL) {
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
function moveCursor(indexFingerLandmark) {
    const cursor = document.getElementById('virtual-cursor');
    if (!cursorEnabled) {
        cursorEnabled = true;
        cursor.style.display = 'block';
    }
    cursorTargetX = (1 - indexFingerLandmark.x) * window.innerWidth;
    cursorTargetY = indexFingerLandmark.y * window.innerHeight;
    checkNodeHover(cursorX, cursorY);
    cursor.classList.toggle('active', !!hoveredNode);
}

// ==========================================
// NODE SELECTION
// ==========================================
function selectOrEnterNode() {
    if (!cursorX || !cursorY) {
        return '✌️ 2 NGÓN: DI CHUYỂN CURSOR ĐẾN NODE';
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

function checkNodeHover(screenX, screenY) {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(
        (screenX / window.innerWidth) * 2 - 1,
        -(screenY / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(nodeMeshes);
    hoveredNode = intersects.length > 0 ? intersects[0].object.userData : null;
}

// ==========================================
// MEDIAPIPE INITIALIZATION
// ==========================================
async function startMediaPipe() {
    if (isMediaPipeRunning) return;

    // === BẮT BUỘC XIN QUYỀN CAMERA ===
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: 640,
                height: 480,
                facingMode: 'user'
            }
        });
        // Đóng stream tạm để MediaPipe tự quản lý
        stream.getTracks().forEach(track => track.stop());
        console.log('✅ Camera permission granted');
    } catch (err) {
        console.error('❌ Camera permission denied:', err);
        alert('⚠️ Cần cấp quyền Camera để sử dụng chế độ cử chỉ tay!\n\nVui lòng:\n1. Nhấn vào biểu tượng camera trên thanh địa chỉ\n2. Chọn "Cho phép" (Allow)\n3. Tải lại trang');
        return;
    }

    const video = document.querySelector('.input_video');
    const canvas = document.getElementById('camera-preview');
    const ctx = canvas.getContext('2d');

    handsInstance = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    handsInstance.setOptions({
        maxNumHands: 2,
        modelComplexity: 0,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.5
    });

    handsInstance.onResults((results) => {
        if (!isMediaPipeRunning) return;

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

    cameraInstance = new Camera(video, {
        onFrame: async () => {
            if (isMediaPipeRunning && handsInstance) {
                await handsInstance.send({ image: video });
            }
        },
        width: 320,
        height: 240
    });

    cameraInstance.start().then(() => {
        isMediaPipeRunning = true;
        console.log('✅ MediaPipe started');
    });
}

function stopMediaPipe() {
    isMediaPipeRunning = false;
    if (cameraInstance) {
        cameraInstance.stop();
    }
    if (handsInstance) {
        handsInstance.close();
    }
    console.log('⏹️ MediaPipe stopped');
}

// ==========================================
// EXPORT (for debugging)
// ==========================================
console.log('✅ gesture.js loaded');
