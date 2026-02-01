// 2. GLOBAL VARIABLES
// ==========================================
let scene, camera, renderer;
let timelineGroup, particleSystem, nodeParticles = {};
let nodeMeshes = [], connectionLines = [];
let bgStars;

// Interaction state
let currentZoom = 1.0;
let panOffset = { x: 0, y: 0 };
let selectedNode = null;
let hoveredNode = null;

// === PHYSICS ENGINE STATE ===
let targetZoom = 1.0;
let targetPan = { x: 0, y: 0 };
let scrollVelocity = 0;
let isHandActive = false;

// Cursor with LERP smoothing
let cursorTargetX = window.innerWidth / 2;
let cursorTargetY = window.innerHeight / 2;

// === GESTURE COOLDOWNS ===
let lastSwipeTime = 0;
let lastBackTime = 0;
let lastZoomTime = 0;

// Carousel state
let currentCardIndex = 0; // Current active card in carousel (0-indexed)

// Hand tracking
let leftHand = null, rightHand = null;
let prevPinchDist = 0;

// NEW: Delta-based pan (preserve position when hand leaves)
let prevPanPos = null;
let isPanning = false;

// NEW: Virtual cursor
let cursorEnabled = false;
let cursorX = window.innerWidth / 2;
let cursorY = window.innerHeight / 2;

// NEW: Toggle cursor function
function toggleCursor() {
    cursorEnabled = !cursorEnabled;
    const btn = document.getElementById('btn-toggle-cursor');
    const cursor = document.getElementById('virtual-cursor');
    if (cursorEnabled) {
        btn.textContent = '👆 Con trỏ: Bật';
        btn.classList.add('active');
        cursor.style.display = 'block';
    } else {
        btn.textContent = '👆 Con trỏ: Tắt';
        btn.classList.remove('active');
        cursor.style.display = 'none';
    }
}

// NEW: Check if hand is a fist (all fingers closed)
function isFist(landmarks) {
    const fingers = countExtendedFingers(landmarks);
    return !fingers.index && !fingers.middle && !fingers.ring && !fingers.pinky;
}

// ==========================================
// DETAIL VIEW (Drill-down) Functions
// ==========================================
let isInDetailView = false;
let currentDetailNode = null;
let detailViewCooldown = false; // Prevent immediate exit
let lastDetailOpenTime = 0;
const DETAIL_COOLDOWN_MS = 1500; // 1.5 seconds cooldown

// Animate node zoom before opening detail view
function animateNodeZoom(nodeMesh, callback) {
    if (!nodeMesh) {
        callback();
        return;
    }

    const startScale = nodeMesh.scale.x;
    const endScale = startScale * 2.5;
    const duration = 500; // ms
    const startTime = Date.now();

    function animate() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Easing: easeOutCubic for smooth deceleration
        const eased = 1 - Math.pow(1 - progress, 3);

        const scale = startScale + (endScale - startScale) * eased;
        nodeMesh.scale.set(scale, scale, scale);

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            // Reset scale and call callback
            nodeMesh.scale.set(startScale, startScale, startScale);
            callback();
        }
    }

    animate();
}

function openDetailView(nodeData) {
    currentGestureContext = GESTURE_CONTEXT.DETAIL;

    if (!nodeData) return;

    // Prevent opening again if already in detail view
    if (isInDetailView) return;

    isInDetailView = true;
    currentDetailNode = nodeData;
    detailViewCooldown = true;
    lastDetailOpenTime = Date.now();

    // Reset cooldown after delay
    setTimeout(() => {
        detailViewCooldown = false;
    }, DETAIL_COOLDOWN_MS);

    const overlay = document.getElementById('detail-overlay');
    const title = document.getElementById('detail-title');
    const quote = document.getElementById('detail-quote');
    const eventsSection = document.getElementById('events-section');
    const eventsContainer = document.getElementById('detail-events');
    const subnodesSection = document.getElementById('subnodes-section');
    const subnodesContainer = document.getElementById('detail-subnodes');

    // Set title (use title from data, fallback to year)
    title.textContent = nodeData.title || `Sự kiện năm ${nodeData.year}`;

    // Set quote/description 
    quote.textContent = nodeData.description || 'Không có hành trình nào mà không có thử thách. Đây là giai đoạn đối mặt với những khó khăn, học cách thích nghi và tìm ra giải pháp sáng tạo.';

    // Events - Tạo placeholder events nếu không có
    const events = nodeData.events || [
        { date: nodeData.year || 'N/A', title: nodeData.title || 'Sự kiện', desc: 'Chi tiết đang được cập nhật...' }
    ];

    eventsContainer.innerHTML = events.map(event => `
        <div class="event-item">
            <div class="event-date">${event.date}</div>
            <div class="event-content">
                <div class="event-title">${event.title}</div>
                <div class="event-desc">${event.desc || ''}</div>
            </div>
        </div>
    `).join('');

    // Sub-nodes - Tạo placeholder nếu không có
    const subnodes = nodeData.subNodes || [
        { label: 'Chi tiết 1', desc: 'Đang cập nhật...' },
        { label: 'Chi tiết 2', desc: 'Đang cập nhật...' }
    ];

    subnodesContainer.innerHTML = subnodes.map(subNode => `
        <div class="subnode-btn">
            <div class="subnode-title">${subNode.label}</div>
            <div class="subnode-desc">${subNode.desc || ''}</div>
        </div>
    `).join('');

    // Show overlay with animation
    overlay.style.display = 'block';
    requestAnimationFrame(() => {
        overlay.classList.add('show');
    });


}

function exitDetailView() {
    // Check cooldown - only exit if enough time has passed
    if (detailViewCooldown) {
        return; // Don't exit during cooldown
    }

    isInDetailView = false;
    currentDetailNode = null;

    const overlay = document.getElementById('detail-overlay');

    // Hide overlay with animation
    overlay.classList.remove('show');
    setTimeout(() => {
        overlay.style.display = 'none';
    }, 400);


    currentGestureContext = GESTURE_CONTEXT.TIMELINE;

}

// ==========================================
// 3. THREE.JS INITIALIZATION
// ==========================================
function init3D(skipTimeline = false) {
    // CRITICAL: Prevent multiple calls (fixes missing nodes issue)
    if (isInit3DCompleted) {
        console.log('⚠️ init3D already completed, skipping to prevent scene reset');
        return;
    }

    console.log('✅ Initializing 3D scene...');

    const container = document.getElementById('canvas-container');

    scene = new THREE.Scene();
    // DISABLED FOG for performance (saves 3-5ms per frame)
    // scene.fog = new THREE.FogExp2(0x0a0a1a, 0.003);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 150;

    renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance'
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    container.appendChild(renderer.domElement);

    // Create main group for timeline (for pan/zoom)
    timelineGroup = new THREE.Group();
    scene.add(timelineGroup);

    // Chỉ tạo timeline mặc định nếu không bỏ qua
    if (!skipTimeline) {
        createTimeline();
        createNodes();
        createConnections();
    }

    // Only start loop if not already running
    if (!window.animationLoopStarted) {
        window.animationLoopStarted = true;
        animate();
    }

    isInit3DCompleted = true;
    console.log('✅ 3D scene initialized successfully');
}

// DELETED: createBackgroundStars() and createParticleSystem()
// These functions were never called - 100+ lines of dead code removed
// This reduces file size and eliminates confusion

// ==========================================
// 6. TIMELINE LINE
// ==========================================
// Global variable for the curve
let mainTimelineCurve = null;

// ==========================================
// 6. TIMELINE LINE
// ==========================================
function createTimeline() {
    // 1. TẠO ĐƯỜNG CONG (Curve)
    // Bạn có thể chỉnh các điểm Vector3 ở đây để đổi hình dáng đường line
    const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-CONFIG.timelineLength - 50, 20, 0),  // Đầu xa nhất
        new THREE.Vector3(-200, 40, 0),    // Đỉnh sóng 1
        new THREE.Vector3(-100, -30, 0),   // Đáy sóng 1
        new THREE.Vector3(0, 40, 0),    // Đỉnh sóng 2
        new THREE.Vector3(100, -30, 0),      // Đáy sóng trung tâm
        new THREE.Vector3(200, 40, 0),     // Đỉnh sóng 3
        new THREE.Vector3(300, -30, 0),    // Đáy sóng 3
        new THREE.Vector3(400, 40, 0),      // Đỉnh sóng 4
        new THREE.Vector3(CONFIG.timelineLength + 50, -20, 0)   // Điểm 7 - Cuối xa phải
    ]);

    // Save globally for connections
    mainTimelineCurve = curve;

    // 2. TẠO HÌNH KHỐI (Geometry) - Dùng TubeGeometry để có độ dày
    // Tham số thứ 3 (2) là RADIUS (Độ to). Chỉnh số này để to/nhỏ.
    const tubeGeometry = new THREE.TubeGeometry(curve, 100, 3, 8, false);

    // 3. MATERIAL CHÍNH (Lõi vàng sáng)
    const material = new THREE.MeshBasicMaterial({
        color: 0xFFD700, // Màu vàng Gold
        transparent: true,
        opacity: 0.8     // Độ đậm
    });

    const timeline = new THREE.Mesh(tubeGeometry, material);
    timelineGroup.add(timeline);

    // 4. HIỆU ỨNG GLOW (Lớp vỏ ngoài phát sáng)
    // Radius to hơn (4) và opacity thấp (0.3) để tạo vùng hào quang
    const glowGeometry = new THREE.TubeGeometry(curve, 100, 4, 8, false);
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0xFF6B6B, // Màu đỏ cam (Neon)
        transparent: true,
        opacity: 0.3,
        side: THREE.BackSide // Render mặt sau để nhìn xuyên thấu đẹp hơn
    });

    const glowLine = new THREE.Mesh(glowGeometry, glowMaterial);
    timelineGroup.add(glowLine);
}

// ==========================================
// 7. NODES (Interactive Points)
// ==========================================
// Tính toán vị trí Y thực tế của node dựa trên position và offsetY
function calculateNodeY(nodeData) {
    // Tìm điểm trên đường cong chính tại vị trí x của node
    let baseY = 0;
    if (mainTimelineCurve) {
        const curvePoints = mainTimelineCurve.getPoints(200);
        let closestP = curvePoints[0];
        let minDiff = Math.abs(closestP.x - nodeData.x);

        for (let p of curvePoints) {
            const diff = Math.abs(p.x - nodeData.x);
            if (diff < minDiff) {
                minDiff = diff;
                closestP = p;
            }
        }
        baseY = closestP.y;
    }

    // Tính Y dựa trên position và offsetY
    const offset = nodeData.offsetY || 40;
    if (nodeData.position === "above") {
        return baseY + offset;
    } else {
        return baseY - offset;
    }
}

function createNodes() {
    timelineData.nodes.forEach(nodeData => {
        // ⭐ TÍNH TOÁN VỊ TRÍ Y TỪ CẤU TRÚC MỚI
        const nodeY = calculateNodeY(nodeData);

        // Lưu lại vị trí Y đã tính toán để dùng ở các function khác
        nodeData.y = nodeY;

        // Node sphere
        const geometry = new THREE.SphereGeometry(CONFIG.nodeRadius, 32, 32);
        const material = new THREE.MeshBasicMaterial({
            color: nodeData.color,
            transparent: true,
            opacity: 0.9
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(nodeData.x, nodeY, 0);
        mesh.userData = nodeData;
        timelineGroup.add(mesh);
        nodeMeshes.push(mesh);

        // Glow ring around node (vòng đứt quãng như hình tham khảo)
        const ringGeo = new THREE.RingGeometry(CONFIG.nodeRadius + 2, CONFIG.nodeRadius + 4, 32);
        const ringMat = new THREE.MeshBasicMaterial({
            color: nodeData.color,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(nodeData.x, nodeY, 0);
        mesh.userData.ring = ring;
        timelineGroup.add(ring);

        // Node particles
        createNodeParticles(nodeData);

        // Label (ở phía ĐỐI NGHỊCH với node)
        createNodeLabel(nodeData);
    });
}

function createNodeParticles(nodeData) {
    const positions = [], colors = [], phases = [];
    const count = CONFIG.nodeParticleCount;
    const nodeY = nodeData.y;

    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 15 + Math.random() * 20;
        const x = nodeData.x + Math.cos(angle) * radius;
        const y = nodeY + Math.sin(angle) * radius;
        const z = (Math.random() - 0.5) * 30;
        positions.push(x, y, z);

        const color = new THREE.Color(nodeData.color);
        colors.push(color.r, color.g, color.b);
        phases.push(Math.random() * Math.PI * 2);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.userData = { phases, nodeData, originalPositions: [...positions] };

    const mat = new THREE.PointsMaterial({
        size: 1.5,
        vertexColors: true,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    const particles = new THREE.Points(geo, mat);
    nodeParticles[nodeData.id] = particles;
    timelineGroup.add(particles);
}

function createNodeLabel(nodeData) {
    const nodeY = nodeData.y;

    // ⭐ LOGIC MỚI: Label ở phía ĐỐI NGHỊCH với node
    // Node ở trên (above) → Label ở DƯỚI đường line chính
    // Node ở dưới (below) → Label ở TRÊN đường line chính

    // Tìm vị trí Y của line chính tại x này
    let lineY = 0;
    if (mainTimelineCurve) {
        const curvePoints = mainTimelineCurve.getPoints(200);
        for (let p of curvePoints) {
            if (Math.abs(p.x - nodeData.x) < Math.abs(curvePoints[0].x - nodeData.x)) {
                lineY = p.y;
            }
        }
    }

    // Tính vị trí label (phía đối nghịch)
    const labelOffset = 30; // Khoảng cách label từ line chính
    let labelY;
    if (nodeData.position === "above") {
        // Node ở trên → Label ở dưới line
        labelY = lineY - labelOffset;
    } else {
        // Node ở dưới → Label ở trên line
        labelY = lineY + labelOffset;
    }

    // Label tên node
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');

    ctx.font = 'bold 24px Segoe UI';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 8;
    ctx.fillText(nodeData.label, 128, 40);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(40, 10, 1);
    sprite.position.set(nodeData.x, labelY, 0);
    timelineGroup.add(sprite);

    // Label năm (year) - ở gần node
    if (nodeData.year) {
        const yearCanvas = document.createElement('canvas');
        yearCanvas.width = 128; yearCanvas.height = 48;
        const yearCtx = yearCanvas.getContext('2d');

        yearCtx.font = 'bold 20px Segoe UI';
        yearCtx.fillStyle = '#FFD700'; // Màu vàng Gold
        yearCtx.textAlign = 'center';
        yearCtx.shadowColor = 'rgba(0,0,0,0.8)';
        yearCtx.shadowBlur = 6;
        yearCtx.fillText(nodeData.year, 64, 30);

        const yearTexture = new THREE.CanvasTexture(yearCanvas);
        const yearMaterial = new THREE.SpriteMaterial({ map: yearTexture, transparent: true });
        const yearSprite = new THREE.Sprite(yearMaterial);
        yearSprite.scale.set(20, 8, 1);

        // Year label gần node (offset nhỏ hơn)
        const yearLabelOffset = (nodeData.position === "above") ? -15 : 15;
        yearSprite.position.set(nodeData.x, nodeY + yearLabelOffset, 0);
        timelineGroup.add(yearSprite);
    }
}

// ==========================================
// 8. CONNECTIONS (Lines between nodes)
// ==========================================
// ==========================================
// 8. CONNECTIONS (Lines from Main Line to Nodes)
// ==========================================
function createConnections() {
    // Lấy danh sách điểm trên đường cong chính để tìm điểm gần nhất
    const curvePoints = mainTimelineCurve ? mainTimelineCurve.getPoints(200) : [];

    timelineData.nodes.forEach(node => {
        // TÌM ĐIỂM BẮT ĐẦU CHÍNH XÁC TRÊN ĐƯỜNG CONG
        // Thay vì (node.x, 0, 0), ta tìm điểm trên curve có tọa độ x gần với node.x nhất
        let startPoint = new THREE.Vector3(node.x, 0, 0);

        if (curvePoints.length > 0) {
            // Tìm điểm có khoảng cách x nhỏ nhất
            let closestP = curvePoints[0];
            let minDiff = Math.abs(closestP.x - node.x);

            for (let p of curvePoints) {
                const diff = Math.abs(p.x - node.x);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestP = p;
                }
            }
            startPoint = closestP.clone();
        }

        // Điểm kết thúc: Tại vị trí node
        const endPoint = new THREE.Vector3(node.x, node.y, 0);

        // Tạo đường cong nhẹ cho tự nhiên
        const midPoint = new THREE.Vector3(
            node.x,
            (startPoint.y + node.y) / 2, // Trung điểm y
            15
        );

        const curve = new THREE.QuadraticBezierCurve3(
            startPoint,
            midPoint,
            endPoint
        );

        // 1. Ống kết nối (Branch)
        // - Radius 0.8 (đủ dày để trông cứng cáp như cành cây)
        const tubeGeometry = new THREE.TubeGeometry(curve, 20, 0.8, 8, false);

        // - Màu VÀNG GOLD giống trục chính -> Tạo cảm giác "liền khối"
        const material = new THREE.MeshBasicMaterial({
            color: 0xFFD700,
            transparent: true,
            opacity: 0.8 // Opacity cao hơn để trông rắn rỏi
        });

        const mesh = new THREE.Mesh(tubeGeometry, material);
        connectionLines.push(mesh);
        timelineGroup.add(mesh);

        // 2. Khớp nối (Joint)
        // Tạo một khối cầu tại điểm giao nhau để che vết cắt -> Trông như mọc ra từ thân
        const jointGeometry = new THREE.SphereGeometry(2.5, 16, 16); // Hơi to hơn radius main line (2) một chút
        const jointMesh = new THREE.Mesh(jointGeometry, material);
        jointMesh.position.copy(startPoint);
        timelineGroup.add(jointMesh);
    });
}

// ==========================================
// 8.5. CARD-SPECIFIC TIMELINE (New Feature)
// ==========================================
// Biến lưu trạng thái timeline hiện tại
let currentCardId = null;

// Xóa timeline hiện tại để tạo mới
function clearCurrentTimeline() {
    // Xóa tất cả objects trong timelineGroup, giữ lại group
    while (timelineGroup.children.length > 0) {
        const obj = timelineGroup.children[0];
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
            if (Array.isArray(obj.material)) {
                obj.material.forEach(m => m.dispose());
            } else {
                obj.material.dispose();
            }
        }
        timelineGroup.remove(obj);
    }

    // Reset các arrays
    nodeMeshes = [];
    connectionLines = [];
    nodeParticles = {};
    mainTimelineCurve = null;
}

// TẠO TIMELINE RIÊNG CHO TỪNG CARD
function createCardTimeline(cardId) {
    // Tìm card data
    const card = timelineData.cards.find(c => c.id === cardId);
    if (!card || !card.timelineNodes || card.timelineNodes.length === 0) {
        console.error('Card not found or has no nodes:', cardId);
        return;
    }

    // ⭐ RESET PAN/ZOOM ĐỂ ĐẢM BẢO VIEW ĐÚNG (sync both target AND current)
    targetPan = { x: 0, y: 0 };
    panOffset = { x: 0, y: 0 };
    targetZoom = 1.0;
    currentZoom = 1.0;

    // Xóa timeline cũ
    clearCurrentTimeline();
    currentCardId = cardId;

    const nodes = card.timelineNodes;
    const nodeCount = nodes.length;

    console.log(`Creating timeline for card ${cardId} with ${nodeCount} nodes`);

    // ==========================================
    // 1. TẠO ĐƯỜNG CONG DỰA TRÊN SỐ NODES (DYNAMIC)
    // ==========================================

    // 🎯 DYNAMIC PARAMETERS BASED ON NODE COUNT
    // Timeline rộng hơn khi có nhiều nodes
    const baseSpacing = 100; // Khoảng cách tối thiểu giữa các nodes
    const totalWidth = Math.max(400, nodeCount * baseSpacing); // Tối thiểu 400, mở rộng theo số nodes
    const nodeSpacing = totalWidth / (nodeCount + 1);

    // Wave height giảm dần khi có nhiều nodes để tránh overlap
    let waveHeight;
    if (nodeCount <= 3) {
        waveHeight = 40;
    } else if (nodeCount <= 5) {
        waveHeight = 35;
    } else if (nodeCount <= 7) {
        waveHeight = 30;
    } else {
        waveHeight = 25;
    }

    // ⭐ Nếu card có waveAmplitude riêng, dùng nó thay vì default
    if (card.waveAmplitude !== null && card.waveAmplitude !== undefined) {
        waveHeight = card.waveAmplitude;
        console.log(`🌊 Card ${cardId} dùng waveAmplitude riêng: ${waveHeight}`);
    }

    // 🔍 AUTO-ZOOM: Camera zoom out cho timelines rộng hơn (sync both values)
    let autoZoom;
    if (nodeCount <= 3) {
        autoZoom = 1.0;
    } else if (nodeCount <= 5) {
        autoZoom = 0.85;
    } else if (nodeCount <= 7) {
        autoZoom = 0.7;
    } else {
        autoZoom = 0.55; // Zoom out nhiều cho 8+ nodes
    }
    targetZoom = autoZoom;
    currentZoom = autoZoom;

    console.log(`📐 Dynamic params: width=${totalWidth}, spacing=${nodeSpacing.toFixed(1)}, wave=${waveHeight}, zoom=${currentZoom}`);

    // Tạo các điểm cho đường cong
    const curvePoints = [];

    // Điểm bắt đầu (ngoài viewport bên trái)
    curvePoints.push(new THREE.Vector3(-totalWidth / 2 - 50, 0, 0));

    // Tạo sóng cho mỗi node
    for (let i = 0; i < nodeCount; i++) {
        const x = -totalWidth / 2 + nodeSpacing * (i + 1);
        // Xen kẽ đỉnh/đáy: node đầu tiên ở trên, node thứ 2 ở dưới...
        const y = (i % 2 === 0) ? waveHeight : -waveHeight;
        curvePoints.push(new THREE.Vector3(x, y, 0));

        // Cập nhật position cho node data
        nodes[i].position = (i % 2 === 0) ? "above" : "below";
        nodes[i].x = x;
    }

    // Điểm kết thúc (ngoài viewport bên phải)
    curvePoints.push(new THREE.Vector3(totalWidth / 2 + 50, 0, 0));

    // Tạo đường cong mượt
    const curve = new THREE.CatmullRomCurve3(curvePoints);
    mainTimelineCurve = curve;

    // ==========================================
    // 2. VẼ ĐƯỜNG SÓNG CHÍNH
    // ==========================================
    const tubeGeometry = new THREE.TubeGeometry(curve, 100, 3, 8, false);
    const material = new THREE.MeshBasicMaterial({
        color: 0xFFD700,
        transparent: true,
        opacity: 0.8
    });
    const timeline = new THREE.Mesh(tubeGeometry, material);
    timelineGroup.add(timeline);

    // Glow effect
    const glowGeometry = new THREE.TubeGeometry(curve, 100, 4, 8, false);
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: card.color || 0xFF6B6B,
        transparent: true,
        opacity: 0.3,
        side: THREE.BackSide
    });
    const glowLine = new THREE.Mesh(glowGeometry, glowMaterial);
    timelineGroup.add(glowLine);

    // ==========================================
    // 3. TẠO NODES VÀ LABELS
    // ==========================================
    nodes.forEach((nodeData, index) => {
        // Tính vị trí Y của node trên đường cong - TÌM ĐỈNH/ĐÁY THỰC SỰ
        const curvePointsList = curve.getPoints(300);  // Tăng độ chính xác

        // Tìm các điểm trong vùng lân cận của node (±50px)
        const nearbyPoints = curvePointsList.filter(p => Math.abs(p.x - nodeData.x) < 50);

        let closestP;
        if (nodeData.position === "above") {
            // Node ở trên → tìm điểm có Y CAO NHẤT (đỉnh sóng)
            closestP = nearbyPoints.reduce((max, p) => p.y > max.y ? p : max, nearbyPoints[0]);
        } else {
            // Node ở dưới → tìm điểm có Y THẤP NHẤT (đáy sóng)
            closestP = nearbyPoints.reduce((min, p) => p.y < min.y ? p : min, nearbyPoints[0]);
        }

        // Cập nhật X của node để khớp với đỉnh/đáy thực sự
        nodeData.x = closestP.x;

        const baseY = closestP.y;
        // ⭐ Dùng offsetY riêng từng node từ data.js, nếu không có thì dùng offset mặc định
        const defaultOffset = nodeCount > 6 ? 35 : (nodeCount > 4 ? 40 : 45);
        const offset = nodeData.offsetY !== undefined ? nodeData.offsetY : defaultOffset;
        const nodeY = (nodeData.position === "above") ? baseY + offset : baseY - offset;
        nodeData.y = nodeY;

        // === TẠO NODE (SPHERE) ===
        // ⭐ Dùng nodeRadius riêng từng node nếu có, nếu không thì dùng default
        const defaultRadius = nodeCount > 6 ? 6 : (nodeCount > 4 ? 7 : 8);
        const nodeRadius = nodeData.nodeRadius !== null && nodeData.nodeRadius !== undefined
            ? nodeData.nodeRadius
            : defaultRadius;

        // Lưu bán kính thực tế để dùng cho particles
        nodeData.computedRadius = nodeRadius;

        // DEBUG: Log để kiểm tra giá trị
        console.log(`🔵 Node ${nodeData.id}: nodeRadius=${nodeRadius} (data=${nodeData.nodeRadius}), labelScale=${JSON.stringify(nodeData.labelScale)}`);

        // ⭐ Dùng màu riêng từng node nếu có, nếu không thì dùng màu card
        const nodeColor = nodeData.nodeColor !== null && nodeData.nodeColor !== undefined
            ? nodeData.nodeColor
            : (card.color || 0xFFD700);

        // ⭐ Lấy opacity tùy chỉnh (nếu có)
        const nodeOpacity = nodeData.opacity !== undefined ? nodeData.opacity : 1.0;

        // 🔵 Node dạng 2D Circle (luôn hiện hình tròn)
        const geometry = new THREE.CircleGeometry(nodeRadius, 32);

        let nodeMaterial;

        // Nếu có ảnh -> dùng Texture
        if (nodeData.image) {
            console.log(`🖼️ Đang load ảnh cho node ${nodeData.id}: ${nodeData.image}`);
            const textureLoader = new THREE.TextureLoader();

            // Load texture với callback để xử lý lỗi
            const texture = textureLoader.load(
                nodeData.image,
                // OnLoad
                (tex) => {
                    console.log(`✅ Đã load ảnh: ${nodeData.image}`);
                    // Đảm bảo cập nhật lại material sau khi ảnh load xong
                    tex.colorSpace = THREE.SRGBColorSpace; // Sửa màu cho đúng
                },
                // OnProgress (không cần thiết lắm)
                undefined,
                // OnError
                (err) => {
                    console.error(`❌ Lỗi load ảnh ${nodeData.image}:`, err);
                    // Fallback về màu nếu lỗi
                    if (mesh && mesh.material) {
                        mesh.material.map = null;
                        mesh.material.color.setHex(nodeData.nodeColor || nodeColor);
                        mesh.material.needsUpdate = true;
                    }
                }
            );

            nodeMaterial = new THREE.MeshBasicMaterial({
                map: texture,
                color: 0xffffff, // Khi có map, color phải là trắng để không bị ám màu
                transparent: nodeOpacity < 1.0, // Chỉ bật transparent khi cần
                opacity: nodeOpacity,
                side: THREE.DoubleSide
            });
        } else {
            // Không ảnh -> dùng Màu (như cũ)
            nodeMaterial = new THREE.MeshBasicMaterial({
                color: nodeColor,
                transparent: true,
                opacity: 0.9,
                side: THREE.DoubleSide
            });
        }
        const mesh = new THREE.Mesh(geometry, nodeMaterial);
        mesh.position.set(nodeData.x, nodeY, 5);  // z=5: Node ở TRƯỚC
        mesh.userData = nodeData;
        timelineGroup.add(mesh);
        nodeMeshes.push(mesh);

        // === GLOW RING QUANH NODE ===
        const ringGeo = new THREE.RingGeometry(nodeRadius + 2, nodeRadius + 4, 32);
        const ringMat = new THREE.MeshBasicMaterial({
            color: card.color || 0xFFD700,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(nodeData.x, nodeY, 4);  // z=4: Ring ngay sau node
        mesh.userData.ring = ring;
        timelineGroup.add(ring);

        // === ĐƯỜNG KẾT NỐI TỪ WAVE ĐẾN NODE ===
        const startPoint = closestP.clone();
        startPoint.z = -2;  // Bắt đầu từ phía sau wave
        const endPoint = new THREE.Vector3(nodeData.x, nodeY, 3);  // Kết thúc SÁT node (z=3, node ở z=5)
        const midPoint = new THREE.Vector3(nodeData.x, (startPoint.y + nodeY) / 2, -1);

        const connectionCurve = new THREE.QuadraticBezierCurve3(startPoint, midPoint, endPoint);
        const connGeometry = new THREE.TubeGeometry(connectionCurve, 20, 0.8, 8, false);
        const connMaterial = new THREE.MeshBasicMaterial({
            color: 0xFFD700,
            transparent: true,
            opacity: 0.8
        });
        const connMesh = new THREE.Mesh(connGeometry, connMaterial);
        connectionLines.push(connMesh);
        timelineGroup.add(connMesh);

        // === JOINT (KHỚP NỐI) ===
        const jointGeo = new THREE.SphereGeometry(2.5, 16, 16);
        const jointMesh = new THREE.Mesh(jointGeo, connMaterial);
        jointMesh.position.copy(startPoint);
        timelineGroup.add(jointMesh);

        // === LABEL (Ở PHÍA ĐỐI NGHỊCH VỚI NODE) ===
        // Dynamic offset dựa trên số nodes
        const labelOffset = nodeCount > 6 ? 30 : 35;
        let labelY;
        if (nodeData.position === "above") {
            labelY = baseY - labelOffset; // Node trên → Label dưới
        } else {
            labelY = baseY + labelOffset; // Node dưới → Label trên
        }

        // Tạo label với khung nền mờ
        const labelCanvas = document.createElement('canvas');
        labelCanvas.width = 512;
        labelCanvas.height = 100;
        const ctx = labelCanvas.getContext('2d');
        // THỬ TẮT NỀN Ở ĐÂY
        // Vẽ nền mờ
        ctx.fillStyle = 'rgba(104, 101, 92, 0.6)';
        ctx.roundRect(10, 10, 492, 80, 10);
        ctx.fill();

        // Vẽ viền
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Dynamic font sizes based on node count
        //const yearFontSize = nodeCount > 6 ? 18 : (nodeCount > 4 ? 20 : 22);
        // const titleFontSize = nodeCount > 6 ? 14 : (nodeCount > 4 ? 16 : 18);
        const yearFontSize = 28;   // Font năm to
        const titleFontSize = 20;  // Font title to
        // Vẽ năm (year) - nếu có
        if (nodeData.year) {
            ctx.font = `bold ${yearFontSize}px Segoe UI`;
            ctx.fillStyle = '#FFD700';
            ctx.textAlign = 'center';
            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.shadowBlur = 4;
            ctx.fillText(nodeData.year, 256, 40);
        }

        // Vẽ title
        ctx.font = `${titleFontSize}px Segoe UI`;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(nodeData.title, 256, nodeData.year ? 70 : 55);

        const labelTexture = new THREE.CanvasTexture(labelCanvas);
        const labelMaterial = new THREE.SpriteMaterial({ map: labelTexture, transparent: true });
        const labelSprite = new THREE.Sprite(labelMaterial);

        // ⭐ Dùng labelScale riêng từng node nếu có, nếu không thì dùng default
        let defaultLabelScale;
        if (nodeCount <= 3) {
            defaultLabelScale = { x: 70, y: 15 };
        } else if (nodeCount <= 5) {
            defaultLabelScale = { x: 60, y: 13 };
        } else if (nodeCount <= 7) {
            defaultLabelScale = { x: 50, y: 11 };
        } else {
            defaultLabelScale = { x: 45, y: 10 };
        }
        const labelScale = nodeData.labelScale !== null && nodeData.labelScale !== undefined
            ? nodeData.labelScale
            : defaultLabelScale;

        labelSprite.scale.set(labelScale.x, labelScale.y, 1);
        labelSprite.position.set(nodeData.x, labelY, 0);
        timelineGroup.add(labelSprite);

        // ⭐ TẠO PARTICLES CHO NODE (ĐÃ TẮT)
        // createNodeParticles(nodeData, nodeColor);
    });

    console.log(`✅ Card ${cardId} timeline created with ${nodeCount} nodes`);
}

// ==========================================
// TẠO PARTICLES BAY XUNG QUANH NODE
// ==========================================
function createNodeParticles(nodeData, nodeColor) {
    const positions = [], colors = [], phases = [];
    const count = 20; // Số lượng hạt mỗi node (có thể điều chỉnh)

    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;

        // ⭐ Quỹ đạo hạt: Giá trị PIXEL trực tiếp (không nhân scale)
        // orbitMin/Max là khoảng cách tính bằng pixel từ tâm node
        const orbitMin = nodeData.orbitMin !== undefined ? nodeData.orbitMin : 10;  // Mặc định 50px
        const orbitMax = nodeData.orbitMax !== undefined ? nodeData.orbitMax : 30; // Mặc định 150px

        // Random trong khoảng từ orbitMin đến orbitMax (pixel)
        const radius = orbitMin + Math.random() * (orbitMax - orbitMin);
        if (i === 0) console.log(`Orbit: ${nodeData.id} | Min:${orbitMin}px | Max:${orbitMax}px | R:${radius.toFixed(0)}px`);

        const x = nodeData.x + Math.cos(angle) * radius;
        const y = nodeData.y + Math.sin(angle) * radius;
        const z = (Math.random() - 0.5) * 30;
        positions.push(x, y, z);

        const color = new THREE.Color(nodeColor || 0xFFD700);
        colors.push(color.r, color.g, color.b);
        phases.push(Math.random() * Math.PI * 2);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.userData = { phases, nodeData, originalPositions: [...positions] };

    const mat = new THREE.PointsMaterial({
        size: 3.5,              // Kích cỡ hạt
        vertexColors: true,
        transparent: true,
        opacity: 0.3,           // Độ trong suốt
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    const particles = new THREE.Points(geo, mat);
    nodeParticles[nodeData.id || nodeData.year] = particles;
    timelineGroup.add(particles);
}

// Quay lại timeline tổng quan (6 cards chính)
function showMainTimeline() {
    clearCurrentTimeline();
    currentCardId = null;

    // Tạo lại timeline chính với 6 nodes tổng quan
    createTimeline();
    createNodes();
    createConnections();

    console.log('✅ Returned to main timeline');
}

// ==========================================
// 9. ANIMATION LOOP
// ==========================================

// --- ZOOM CONTROL with LIMITS ---
const MIN_ZOOM = 0.8;
const MAX_ZOOM = 3.0;

document.addEventListener('wheel', (e) => {
    // Chỉ zoom khi đang ở Timeline View (canvas hiện) và KHÔNG ở trong Detail View
    const canvasContainer = document.getElementById('canvas-container');
    if (!canvasContainer || canvasContainer.style.display === 'none') return;
    if (isInDetailView) return;

    e.preventDefault();

    const zoomSpeed = 0.001;
    let newZoom = targetZoom - e.deltaY * zoomSpeed;

    // Giới hạn Zoom (Clamping)
    newZoom = Math.max(MIN_ZOOM, Math.min(newZoom, MAX_ZOOM));

    targetZoom = newZoom;
}, { passive: false });
// ==========================================
let lastTime = 0;
const targetFPS = 30;
const frameInterval = 1000 / targetFPS;

// Cache Vector3 to avoid garbage collection
const cachedVector3 = new THREE.Vector3(1, 1, 1);

// FPS monitoring
let frameCount = 0;
let lastFPSUpdate = Date.now();

function animate() {
    requestAnimationFrame(animate);

    // FPS limiting
    const currentTime = Date.now();
    const elapsed = currentTime - lastTime;

    if (elapsed < frameInterval) return;
    lastTime = currentTime - (elapsed % frameInterval);

    const time = currentTime * 0.001;

    // FPS counter (log every second)
    frameCount++;
    if (currentTime - lastFPSUpdate >= 1000) {
        console.log(`📊 FPS: ${frameCount}`);
        frameCount = 0;
        lastFPSUpdate = currentTime;
    }

    // PERFORMANCE: Skip all logic and rendering if 3D view is hidden
    if (!DOM.canvasContainer || DOM.canvasContainer.style.display === 'none') return;

    // REMOVED: bgStars and particleSystem dead code (never created)
    // This saves 2-3ms per frame by eliminating unnecessary checks

    // Animate node particles
    Object.values(nodeParticles).forEach(particles => {
        if (!particles.parent) return; // Skip if removed from scene

        const positions = particles.geometry.attributes.position.array;
        const phases = particles.geometry.userData.phases;
        const nodeData = particles.geometry.userData.nodeData;

        for (let i = 0; i < positions.length; i += 3) {
            const idx = i / 3;

            // Lấy giá trị orbitMin/Max từ nodeData (pixel trực tiếp)
            const orbitMin = nodeData.orbitMin !== undefined ? nodeData.orbitMin : 50;
            const orbitMax = nodeData.orbitMax !== undefined ? nodeData.orbitMax : 150;

            // Bán kính dao động giữa min và max tạo hiệu ứng lấp lánh
            const baseRadius = orbitMin + (orbitMax - orbitMin) * (0.5 + 0.5 * Math.sin(time * 2 + phases[idx]));

            // Góc quay theo thời gian (mỗi hạt có phase khác nhau)
            const angle = time * 0.8 + phases[idx];

            // Quỹ đạo TRÒN (X và Y cùng hệ số), cùng mặt phẳng với node (Z cố định)
            positions[i] = nodeData.x + Math.cos(angle) * baseRadius;
            positions[i + 1] = nodeData.y + Math.sin(angle) * baseRadius;
            positions[i + 2] = 6; // Hơi trước node (Z=5) để hiện rõ
        }
        particles.geometry.attributes.position.needsUpdate = true;

        // Highlight if selected
        if (selectedNode && selectedNode.id === nodeData.id) {
            particles.material.opacity = 0.9;
        } else {
            particles.material.opacity = 0.4;
        }
    });

    // Animate node rings - Use simple rotation
    nodeMeshes.forEach(mesh => {
        if (mesh.userData.ring) {
            mesh.userData.ring.rotation.z += 0.01;
            if (hoveredNode && hoveredNode.id === mesh.userData.id) {
                mesh.userData.ring.material.opacity = 0.8;
                mesh.scale.set(1.2, 1.2, 1.2);
            } else {
                mesh.userData.ring.material.opacity = 0.3;
                // Sử dụng cached Vector3 thay vì tạo mới
                cachedVector3.set(1, 1, 1);
                mesh.scale.lerp(cachedVector3, 0.1);
            }
        }
    });

    // === PHYSICS ENGINE: LERP Smoothing ===
    // Zoom smoothing: currentZoom lerps toward targetZoom
    currentZoom += (targetZoom - currentZoom) * CONFIG.ZOOM_SMOOTHING;

    // Pan smoothing: panOffset lerps toward targetPan
    panOffset.x += (targetPan.x - panOffset.x) * CONFIG.PAN_SMOOTHING;
    panOffset.y += (targetPan.y - panOffset.y) * CONFIG.PAN_SMOOTHING;

    // Apply zoom and pan to timeline group
    timelineGroup.scale.set(currentZoom, currentZoom, currentZoom);
    timelineGroup.position.x = panOffset.x;
    timelineGroup.position.y = panOffset.y;

    // === SCROLL VELOCITY with Friction (for Detail View) ===
    if (Math.abs(scrollVelocity) > CONFIG.SCROLL_DEADZONE) {
        const container = document.getElementById('detail-container');
        if (container && isInDetailView) {
            container.scrollTop += scrollVelocity * 50;
        }
        scrollVelocity *= CONFIG.SCROLL_FRICTION;
    }

    // === CURSOR LERP Smoothing ===
    if (cursorEnabled) {
        cursorX += (cursorTargetX - cursorX) * CONFIG.CURSOR_SMOOTHING;
        cursorY += (cursorTargetY - cursorY) * CONFIG.CURSOR_SMOOTHING;
        const cursor = document.getElementById('virtual-cursor');
        if (cursor) {
            cursor.style.left = cursorX + 'px';
            cursor.style.top = cursorY + 'px';
        }
    }

    renderer.render(scene, camera);
}

// ==========================================
// 10. HAND GESTURE RECOGNITION
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
    // Check thumb is also extended (thumb tip far from index base)
    const thumbTip = landmarks[4];
    const indexBase = landmarks[5];
    const thumbExtended = Math.hypot(thumbTip.x - indexBase.x, thumbTip.y - indexBase.y) > 0.1;

    // All 5 fingers must be extended for open hand
    return thumbExtended && fingers.index && fingers.middle && fingers.ring && fingers.pinky;
}

// Check if only pointing with index finger (1 finger)
function isPointingFinger(landmarks) {
    const fingers = countExtendedFingers(landmarks);
    return fingers.index && !fingers.middle && !fingers.ring && !fingers.pinky;
}

// ==========================================
// PROCESS HANDS - NEW TWO-HAND SYSTEM
// ==========================================
function processHands(results) {
    // Chỉ xử lý gesture khi đang ở gesture mode
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

    // === CRITICAL: Reset state when hands lost (Fixes jumping issue) ===
    if (!leftHand && !rightHand) {
        prevPanPos = null;
        isHandActive = false;
        return;
    }
    isHandActive = true;

    // =====================
    // CONTEXT AWARE HANDLING
    // =====================

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
// XỬ LÝ TAY TRÁI - PAN
// ==========================================
function handleLeftHand(landmarks) {
    // Unused legacy function, keeping as placeholder or removing
    return '';
}

// ==========================================
// XỬ LÝ TAY PHẢI - CURSOR + ACTIONS
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

    // Check thumb extended (distance from index base)
    const thumbExtended = Math.hypot(thumb.x - landmarks[5].x, thumb.y - landmarks[5].y) > 0.1;

    // Check if fist (all fingers closed)
    const isFistGesture = !fingers.index && !fingers.middle && !fingers.ring && !fingers.pinky;

    // Check if thumb up only (thumb extended, others closed)
    const isThumbUp = thumbExtended && !fingers.index && !fingers.middle && !fingers.ring && !fingers.pinky;

    // === 1. 🖖 3 NGÓN → Back theo context ===
    if (fingers.index && fingers.middle && fingers.ring && !fingers.pinky) {
        const now = Date.now();
        if (now - lastBackTime < CONFIG.BACK_COOLDOWN) return '🖖 ĐANG CHỜ...';
        lastBackTime = now;

        // Back dựa theo context hiện tại
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

    // === 2. ✊ NẮM ĐẤM → Zoom Out (Timeline only) ===
    if (isFistGesture && currentGestureContext === GESTURE_CONTEXT.TIMELINE) {
        targetZoom = Math.max(CONFIG.zoomMin, targetZoom - CONFIG.ZOOM_OUT_SPEED);
        return '✊ NẮM ĐẤM: ZOOM OUT';
    }

    // === 3. 👍 NGÓN CÁI → Zoom In (Timeline only) ===
    if (isThumbUp && currentGestureContext === GESTURE_CONTEXT.TIMELINE) {
        targetZoom = Math.min(CONFIG.zoomMax, targetZoom + CONFIG.ZOOM_IN_SPEED);
        return '👍 NGÓN CÁI: ZOOM IN';
    }

    // === 4. ✌️ 2 NGÓN → Chọn/Vào node ===
    if (fingers.index && fingers.middle && !fingers.ring && !fingers.pinky) {
        return selectOrEnterNode();
    }

    // === 5. ☝️ NGÓN TRỎ → Di chuyển cursor ===
    if (fingers.index && !fingers.middle && !fingers.ring && !fingers.pinky) {
        moveCursor(index);
        return '☝️ NGÓN TRỎ: DI CHUYỂN CURSOR';
    }

    // Nếu có ngón trỏ duỗi (bất kể cử chỉ nào), vẫn cập nhật cursor
    if (fingers.index) {
        moveCursor(index);
    }

    return '';
}
function handleLeftDetail(landmarks) {
    // Bàn tay mở (5 ngón) để scroll
    if (isOpenHand(landmarks)) {
        const palm = landmarks[9];
        if (!prevPanPos) {
            prevPanPos = palm;
            return;
        }

        const dy = palm.y - prevPanPos.y;
        // Use scrollVelocity for momentum effect
        scrollVelocity = dy * 25;  // Tăng sensitivity
        prevPanPos = palm;
        return;
    }

    // Reset khi không phải open hand
    prevPanPos = null;
}

function handleLeftTimeline(landmarks) {
    if (!isOpenHand(landmarks)) {
        prevPanPos = null;  // Reset when not open hand
        return;
    }

    const palm = landmarks[9];
    if (!prevPanPos) {
        prevPanPos = palm;
        return;
    }

    // Use targetPan for LERP smoothing
    targetPan.x += (prevPanPos.x - palm.x) * 200;
    targetPan.y += (palm.y - prevPanPos.y) * 150;

    prevPanPos = palm;
}


function handleLeftCarousel(landmarks) {
    if (!isOpenHand(landmarks)) {
        prevPanPos = null;  // Reset when not open hand
        return;
    }

    const palm = landmarks[9];
    if (!prevPanPos) {
        prevPanPos = palm;
        return;
    }

    const dx = palm.x - prevPanPos.x;

    // Use CONFIG threshold and cooldown
    const now = Date.now();
    if (now - lastSwipeTime < CONFIG.SWIPE_COOLDOWN) {
        prevPanPos = palm;
        return;
    }

    if (Math.abs(dx) > CONFIG.SWIPE_THRESHOLD) {
        const direction = dx > 0 ? -1 : 1;
        navigateCards(direction);
        lastSwipeTime = now;

        // Visual shake feedback
        const container = document.getElementById('node-cards-container');
        container.classList.add('swipe-shake');
        setTimeout(() => container.classList.remove('swipe-shake'), 400);
    }

    prevPanPos = palm;
}


// ==========================================
// DI CHUYỂN CURSOR ẢO
// ==========================================
function moveCursor(indexFingerLandmark) {
    const cursor = document.getElementById('virtual-cursor');

    // Tự động bật cursor khi dùng ngón trỏ
    if (!cursorEnabled) {
        cursorEnabled = true;
        cursor.style.display = 'block';
    }

    // Chuyển đổi tọa độ (mirrored) - Set TARGET for LERP
    cursorTargetX = (1 - indexFingerLandmark.x) * window.innerWidth;
    cursorTargetY = indexFingerLandmark.y * window.innerHeight;

    // Kiểm tra hover node
    checkNodeHover(cursorX, cursorY);
    cursor.classList.toggle('active', !!hoveredNode);
}

// ==========================================
// CHỌN HOẶC VÀO NODE
// ==========================================
function selectOrEnterNode() {
    if (!cursorX || !cursorY) {
        return '✌️ 2 NGÓN: DI CHUYỂN CURSOR ĐẾN NODE';
    }

    // Visual click feedback on cursor
    const cursor = document.getElementById('virtual-cursor');
    cursor.classList.add('clicking');
    setTimeout(() => cursor.classList.remove('clicking'), 300);

    // Chuyển đổi vị trí cursor sang tọa độ 3D
    const rect = renderer.domElement.getBoundingClientRect();
    const x = (cursorX / rect.width) * 2 - 1;
    const y = -(cursorY / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera({ x, y }, camera);
    const intersects = raycaster.intersectObjects(nodeMeshes);

    if (intersects.length > 0) {
        const node = intersects[0].object.userData;

        if (isInDetailView) {
            // Trong detail view: có thể chọn sub-node (logic tùy chỉnh sau)
            return '✌️ 2 NGÓN: TRONG CHI TIẾT';
        } else {
            // Ngoài: vào detail view với animation
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

    if (intersects.length > 0) {
        hoveredNode = intersects[0].object.userData;
    } else {
        hoveredNode = null;
    }
}

function showNodeInfo(node) {
    const infoPanel = document.getElementById('node-info');
    document.getElementById('node-title').textContent = node.label;
    document.getElementById('node-desc').textContent = node.desc;
    infoPanel.style.display = 'block';
}

// ==========================================
// CAROUSEL & MODE SWITCHING
// ==========================================
let controlMode = null; // 'gesture' or 'mouse'
// =====================
// GESTURE CONTEXT STATE
// =====================
const GESTURE_CONTEXT = {
    WELCOME: 'welcome',
    CAROUSEL: 'carousel',
    DETAIL: 'detail',
    TIMELINE: 'timeline'
};

let currentGestureContext = null;


// Carousel
// currentCardIndex moved to global variables section at top
let currentActiveCard = null;

function getTotalCards() {
    return document.querySelectorAll('.node-card').length;
}

// --- NEW: INVISIBLE CONTROLS LOGIC ---

let isDragging = false;
let startX = 0;
let currentTranslate = 0;
let prevTranslate = 0;
const DRAG_THRESHOLD = 50; // Pixels to trigger slide

function initCarouselControls() {
    const container = document.getElementById('node-cards-container');
    const cards = document.querySelectorAll('.node-card');

    // 1. CLICK LOGIC (Smart Click)
    cards.forEach((card, index) => {
        card.onclick = (e) => {
            // Prevent click if we just dragged
            if (Math.abs(currentTranslate - prevTranslate) > 5) return;

            const cardId = parseInt(card.dataset.nodeId);

            if (index === currentCardIndex) {
                // Click center card -> ENTER
                console.log('🎯 Clicked Center Card -> Enter 3D');
                selectCard(cardId);
            } else {
                // Click side card -> CENTER IT
                console.log('↔️ Clicked Side Card -> Slide to center');
                currentCardIndex = index;
                updateCarouselScale();
            }
        };
    });

    // 2. DRAG LOGIC (Swipe)
    container.onmousedown = (e) => {
        isDragging = true;
        startX = e.clientX;
        container.classList.add('grabbing');
        // Disable transition during drag for responsiveness
        document.getElementById('node-cards-wrapper').style.transition = 'none';
    };

    container.onmouseup = (e) => {
        if (!isDragging) return;
        isDragging = false;
        container.classList.remove('grabbing');

        // Re-enable transition
        document.getElementById('node-cards-wrapper').style.transition = 'transform 0.6s ease-out';

        const movedBy = e.clientX - startX;

        if (movedBy < -DRAG_THRESHOLD) {
            navigateCards(1); // Next
        } else if (movedBy > DRAG_THRESHOLD) {
            navigateCards(-1); // Prev
        } else {
            updateCarouselScale(); // Snap back
        }
    };

    container.onmouseleave = () => {
        if (isDragging) {
            isDragging = false;
            container.classList.remove('grabbing');
            document.getElementById('node-cards-wrapper').style.transition = 'transform 0.6s ease-out';
            updateCarouselScale();
        }
    };

    container.onmousemove = (e) => {
        if (!isDragging) return;
        const currentX = e.clientX;
        const diff = currentX - startX;
        // Visual feedback during drag (optional, simple log for now)
    };

    // 3. WHEEL LOGIC (Scroll)
    container.onwheel = (e) => {
        // Throttle wheel events
        if (Date.now() - lastWheelTime < 500) return;
        lastWheelTime = Date.now();

        if (e.deltaY > 0) {
            navigateCards(1);
        } else {
            navigateCards(-1);
        }
    };
}
let lastWheelTime = 0;


// Lazy load gesture.js only when needed
let gestureScriptLoaded = false;
function loadGestureScript() {
    return new Promise((resolve, reject) => {
        if (gestureScriptLoaded) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = 'gesture.js';
        script.onload = () => {
            gestureScriptLoaded = true;
            console.log('✅ gesture.js lazy loaded');
            resolve();
        };
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

function startGestureMode() {
    controlMode = 'gesture';
    currentGestureContext = GESTURE_CONTEXT.CAROUSEL;
    document.getElementById('welcome-overlay').style.display = 'none';
    document.getElementById('gesture-panel').style.display = 'flex';
    document.getElementById('node-cards-container').style.display = 'flex';
    document.getElementById('canvas-container').style.display = 'none';
    document.getElementById('header').style.display = 'none';

    document.getElementById('global-back-btn').style.display = 'block';

    cursorEnabled = true;
    const cursor = document.getElementById('virtual-cursor');
    if (cursor) cursor.style.display = 'block';

    initCarouselControls();
    updateCarouselScale();
    startSystem();

    // Lazy load gesture.js then start MediaPipe
    loadGestureScript().then(() => {
        startMediaPipe();
    }).catch(err => {
        console.error('Failed to load gesture.js:', err);
    });

    toggleAudio(true);
}

function startMouseMode() {
    controlMode = 'mouse';
    document.getElementById('welcome-overlay').style.display = 'none';
    document.getElementById('gesture-panel').style.display = 'none';
    document.getElementById('node-cards-container').style.display = 'flex';
    document.getElementById('canvas-container').style.display = 'none';
    document.getElementById('header').style.display = 'none';

    // Hiện nút back ngay từ Carousel
    document.getElementById('global-back-btn').style.display = 'block';

    initCarouselControls();
    updateCarouselScale();
    enableMouseControls();
    init3D();
    stopMediaPipe();

    // Auto-play Music via Toggle Function
    toggleAudio(true);
}

// --- AUDIO CONTROL LOGIC ---
function toggleAudio(forcePlay = false) {
    const music = document.getElementById('bg-music');
    const btn = document.getElementById('audio-btn');

    if (!music || !btn) return;

    if (forcePlay) {
        music.volume = 0.5;
        music.play().then(() => {
            btn.textContent = '🎵';
            btn.classList.add('playing');
        }).catch(e => {
            console.log('Autoplay blocked:', e);
            btn.textContent = '🔇';
            btn.classList.remove('playing');
        });
        return;
    }

    if (music.paused) {
        music.volume = 0.5;
        music.play();
        btn.textContent = '🎵';
        btn.classList.add('playing');
    } else {
        music.pause();
        btn.textContent = '🔇';
        btn.classList.remove('playing');
    }
}


// function to navigate cards
function navigateCards(direction) {
    const cards = document.querySelectorAll('.node-card');
    const totalCards = cards.length;
    const newIndex = currentCardIndex + direction;

    if (newIndex < 0 || newIndex >= totalCards) return;

    currentCardIndex = newIndex;
    updateCarouselScale();
}

function updateCarouselScale() {
    const container = document.getElementById('node-cards-container');
    const wrapper = document.getElementById('node-cards-wrapper');
    const cards = Array.from(document.querySelectorAll('.node-card'));

    if (!container || !wrapper || cards.length === 0) return;

    // 1. CALCULATE EXACT CENTER
    // Use window.innerWidth to be sure (minus scrollbar estimation if needed, 
    // but 100vw usually includes scrollbar in some browsers, 
    // so clientWidth is safer for "visible" area).
    const viewportWidth = document.documentElement.clientWidth;
    const cardWidth = 420; // Fixed width from CSS
    const gap = 40;        // Fixed gap from CSS
    const cardTotalWidth = cardWidth + gap;

    // Offset = (Half Screen) - (Half Card) - (N cards * width)
    // This logic places the center of the Nth card EXACTLY at the center of the screen
    const halfScreen = viewportWidth / 2;
    const halfCard = cardWidth / 2;

    // Formula: Center - HalfCard - (Index * (Width + Gap))
    // Example Index 0: Center - 140 - 0 = Center of card 0 at screen center
    // Example Index 1: Center - 140 - 320 = Center of card 1 at screen center
    const offset = halfScreen - halfCard - (currentCardIndex * cardTotalWidth);

    console.log(`📏 Math: Screen=${viewportWidth / 2} - Card=${halfCard} - Shift=${currentCardIndex * cardTotalWidth} = ${offset}`);

    wrapper.style.transform = `translateX(${offset}px)`;

    // Update visual states
    cards.forEach((card, index) => {
        // Clean reset
        card.classList.remove('center', 'side');
        card.style.opacity = '';
        card.style.transform = '';

        const relative = index - currentCardIndex;

        if (relative === 0) {
            card.classList.add('center');
            // Ensure center card is fully opaque and scaled
            card.style.opacity = '1';
        } else if (Math.abs(relative) === 1) {
            card.classList.add('side');
            card.style.opacity = '0.5';
        } else {
            card.style.opacity = '0.2';
            // Far cards scale down
            card.style.transform = 'scale(0.6) translateY(-2rem)';
        }
    });
}


// Add resize listener (Grok recommendation)
window.addEventListener('resize', () => {
    // Only update if carousel is visible
    if (document.getElementById('node-cards-container').style.display !== 'none') {
        updateCarouselScale();
    }
});

function selectCard(cardId) {
    console.log('\n🎯 ========== selectCard CALLED ==========');
    console.log('📌 Card ID:', cardId);
    console.log('📊 isInit3DCompleted:', isInit3DCompleted);
    console.log('🔍 Scene exists:', !!scene);
    console.log('🔍 Renderer exists:', !!renderer);
    console.log('🔍 Camera exists:', !!camera);
    console.log('🔍 nodeMeshes count:', nodeMeshes.length);
    console.log('🔍 DOM.canvasContainer:', !!DOM.canvasContainer);

    // CRITICAL: Ensure DOM cache is initialized
    if (!DOM.canvasContainer) {
        console.warn('❌ DOM cache not initialized! Calling cacheDOMElements()...');
        cacheDOMElements();
    }

    // CRITICAL: Ensure 3D is initialized before showing canvas
    if (!isInit3DCompleted) {
        console.log('⚠️ 3D not initialized yet, initializing now...');
        init3D(true);  // true = skip default timeline since we'll create card-specific one
        console.log('✅ init3D() completed');
        console.log('🔍 After init - Scene:', !!scene);
        console.log('🔍 After init - nodeMeshes:', nodeMeshes.length);
    }

    // ⭐ TẠO TIMELINE RIÊNG CHO CARD NÀY
    console.log('🎨 Creating card-specific timeline...');
    createCardTimeline(cardId);

    // Ẩn carousel
    console.log('👁️ Hiding carousel...');
    document.getElementById('node-cards-container').style.display = 'none';

    // Hiện 3D canvas với timeline
    console.log('👁️ Showing canvas...');
    document.getElementById('canvas-container').style.display = 'block';

    // Hiện header
    const header = document.getElementById('header');
    header.style.display = 'flex';

    // LOGIC CAMERA PREVIEW:
    // Mouse Mode -> Ẩn camera preview (cho sạch)
    // Gesture Mode -> Hiện camera preview
    const camPreview = document.getElementById('camera-preview');
    if (controlMode === 'mouse') {
        camPreview.style.display = 'none';
    } else {
        camPreview.style.display = 'block';
    }

    // Hiện nút back
    document.getElementById('global-back-btn').style.display = 'block';

    // Cập nhật title từ dữ liệu cards
    const card = timelineData.cards.find(c => c.id === cardId);
    if (card) {
        document.getElementById('title').textContent = `☭ ${card.title}`;
    }

    // Lưu current card
    currentActiveCard = cardId;
    currentGestureContext = GESTURE_CONTEXT.TIMELINE; // ✅ ADD

    // Force a render to ensure scene is visible
    if (renderer && scene && camera) {
        console.log('🎨 Forcing initial render...');
        renderer.render(scene, camera);
        console.log('✅ Render complete');
    } else {
        console.error('❌ Cannot render! Missing:',
            !renderer ? 'renderer' : '',
            !scene ? 'scene' : '',
            !camera ? 'camera' : '');
    }

    // Log final state
    console.log('📍 Timeline view active for card:', cardId);
    console.log('🔍 Final check - Nodes in scene:', nodeMeshes.filter(m => m.parent === timelineGroup).length);
    console.log('========== selectCard END ==========\n');
}

function enableMouseControls() {
    // Mouse controls already work via onclick handlers
    console.log('Mouse mode enabled');
}

function exitTimelineView() {
    console.log('Exiting timeline view, returning to carousel');

    // Ẩn 3D canvas
    document.getElementById('canvas-container').style.display = 'none';

    // Ẩn header
    document.getElementById('header').style.display = 'none';

    // Hiện lại carousel
    document.getElementById('node-cards-container').style.display = 'flex';

    // Reset current card & timeline state
    currentActiveCard = null;
    currentCardId = null; // ⭐ IMPORTANT: Reset để goBack() biết đang ở carousel

    // Back button remains visible (for Carousel -> Welcome)
    document.getElementById('global-back-btn').style.display = 'block';
    currentGestureContext = GESTURE_CONTEXT.CAROUSEL;

}

function resetToWelcome() {
    console.log('Resetting to Welcome Screen');
    controlMode = null;

    // Ẩn tất cả giao diện chính
    document.getElementById('node-cards-container').style.display = 'none';
    document.getElementById('canvas-container').style.display = 'none';
    document.getElementById('gesture-panel').style.display = 'none';
    document.getElementById('header').style.display = 'none';
    document.getElementById('global-back-btn').style.display = 'none'; // Ẩn nút back ở welcome

    // Hiện màn hình Welcome
    document.getElementById('welcome-overlay').style.display = 'flex';

    // TẮT AI/Camera hoàn toàn
    stopMediaPipe();
}

// Global back button navigation
function goBack() {
    if (isInDetailView) {
        exitDetailView();
    } else if (currentActiveCard !== null) {
        exitTimelineView();
    } else {
        // Nếu đang ở Carousel (chưa chọn card nào) -> Về Welcome
        resetToWelcome();
    }
}

// ==========================================
// 11. START SYSTEM
// ==========================================
// Start MediaPipe (only for gesture mode)
function startMediaPipe() {
    if (isMediaPipeRunning) return;

    const video = document.querySelector('.input_video');
    const canvas = document.getElementById('camera-preview');
    const ctx = canvas.getContext('2d');

    handsInstance = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    handsInstance.setOptions({
        maxNumHands: 2,
        modelComplexity: 0,  // Giảm từ 1 → 0 (nhanh hơn 30-40%)
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.5
    });

    handsInstance.onResults((results) => {
        if (!isMediaPipeRunning) return; // Skip if stopped

        // Draw camera preview
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

        // Draw hand landmarks
        if (results.multiHandLandmarks) {
            results.multiHandLandmarks.forEach(landmarks => {
                // Draw fingertips
                [4, 8, 12, 16, 20].forEach(tip => {
                    ctx.beginPath();
                    ctx.arc(landmarks[tip].x * canvas.width, landmarks[tip].y * canvas.height, 4, 0, Math.PI * 2);
                    ctx.fillStyle = '#FFD700';
                    ctx.fill();
                });
            });
        }

        // Only process gestures when in timeline view (not carousel/detail)
        if (currentActiveCard !== null && !isInDetailView) {
            processHands(results);
        }
    });

    cameraInstance = new Camera(video, {
        onFrame: async () => {
            if (isMediaPipeRunning && handsInstance) {
                await handsInstance.send({ image: video });
            }
        },
        width: 320,  // Giảm từ 640 → 320 (75% ít pixel hơn)
        height: 240  // Giảm từ 480 → 240
    });

    cameraInstance.start().then(() => {
        isMediaPipeRunning = true;
        document.getElementById('status').textContent = 'Sẵn sàng! Đưa tay vào camera';
    });
}

// Stop MediaPipe (save CPU)
function stopMediaPipe() {
    isMediaPipeRunning = false;

    if (typeof cameraInstance !== 'undefined' && cameraInstance) {
        cameraInstance.stop();
    }

    if (handsInstance) {
        handsInstance.close();
    }
}

function startSystem() {
    document.getElementById('btnStart').style.display = 'none';
    init3D();
    cacheDOMElements(); // Initialize DOM cache
    // MediaPipe sẽ chỉ start khi chọn Gesture Mode
}

// ==========================================
// 12. WINDOW RESIZE
// ==========================================
window.addEventListener('resize', () => {
    if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
});

// ==========================================
// 13. MOUSE CONTROLS
// ==========================================
let isMouseDragging = false;
let lastMousePos = { x: 0, y: 0 };

// Mouse move - update hover and cursor
document.addEventListener('mousemove', (e) => {
    if (isInDetailView) return;

    // Update hover
    checkNodeHover(e.clientX, e.clientY);

    // Drag to pan - UPDATE targetPan for LERP physics
    if (isMouseDragging) {
        const deltaX = (lastMousePos.x - e.clientX) * 0.5;
        const deltaY = (e.clientY - lastMousePos.y) * 0.5;
        targetPan.x += deltaX;
        targetPan.y += deltaY;
        lastMousePos = { x: e.clientX, y: e.clientY };
    }
});

// Mouse down - start drag or select
document.addEventListener('mousedown', (e) => {
    if (isInDetailView) return;
    if (e.target.closest('#controls') || e.target.closest('#header') || e.target.closest('button')) return;

    lastMousePos = { x: e.clientX, y: e.clientY };

    // Check if clicking on a node
    if (hoveredNode) {
        selectedNode = hoveredNode;
        showNodeInfo(selectedNode);
        document.getElementById('status').textContent = `Đã chọn: ${selectedNode.label}`;
    } else {
        isMouseDragging = true;
        document.body.style.cursor = 'grabbing';
    }
});

// Mouse up - stop drag
document.addEventListener('mouseup', () => {
    isMouseDragging = false;
    document.body.style.cursor = 'default';
});

// Double click - enter detail view
document.addEventListener('dblclick', (e) => {
    if (isInDetailView) return;
    if (e.target.closest('#controls') || e.target.closest('#header') || e.target.closest('button')) return;

    if (selectedNode && selectedNode.content) {
        const fullNode = timelineData.nodes.find(n => n.id === selectedNode.id);
        if (fullNode) {
            // Find mesh and animate
            const nodeMesh = nodeMeshes.find(m => m.userData.id === fullNode.id);
            animateNodeZoom(nodeMesh, () => {
                openDetailView(fullNode);
            });

        }
    }
});

// Scroll - zoom in/out (UPDATE targetZoom for LERP)
document.addEventListener('wheel', (e) => {
    if (isInDetailView) return;

    e.preventDefault();
    const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
    targetZoom = Math.max(CONFIG.zoomMin, Math.min(CONFIG.zoomMax, targetZoom + zoomDelta));

}, { passive: false });

// Right click - exit detail view or reset
document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (isInDetailView) {
        exitDetailView();
    } else {
        // Reset pan and zoom (both target AND current for immediate + smooth effect)
        targetPan = { x: 0, y: 0 };
        panOffset = { x: 0, y: 0 };
        targetZoom = 1.0;
        currentZoom = 1.0;
        selectedNode = null;
        document.getElementById('node-info').style.display = 'none';

    }
});

// ==========================================
// KEYBOARD NAVIGATION (Inspired by Grok)
// ==========================================
document.addEventListener('keydown', (e) => {
    // Only work when carousel is visible
    const carouselVisible = document.getElementById('node-cards-container').style.display === 'flex';
    if (!carouselVisible) return;

    if (e.key === 'ArrowLeft' || e.keyCode === 37) {
        e.preventDefault();
        navigateCards(-1); // Previous card
    } else if (e.key === 'ArrowRight' || e.keyCode === 39) {
        e.preventDefault();
        navigateCards(1); // Next card
    } else if (e.key === 'Enter' && currentCardIndex >= 0) {
        e.preventDefault();
        // Select current active card
        selectCard(currentCardIndex + 1); // +1 because cards are 1-indexed
    }
});

// ==========================================
// CARD CLICK HANDLERS - Kết nối click vào card với createCardTimeline
// ==========================================

// Thêm click listeners cho các cards khi DOM load xong
document.addEventListener('DOMContentLoaded', () => {
    // Delay để đảm bảo cards đã được tạo xong
    setTimeout(() => {
        initCarouselControls();
    }, 100);
});

// NEW: Hàm khởi tạo carousel controls
function initCarouselControls() {
    const container = document.getElementById('node-cards-container');
    const cards = document.querySelectorAll('.node-card');

    // CLICK LOGIC - Di chuyển từng bước
    cards.forEach((card, index) => {
        card.onclick = () => {
            const cardId = parseInt(card.dataset.nodeId);

            if (index === currentCardIndex) {
                // Click center card -> ENTER timeline
                console.log('🎯 Clicked Center Card -> Enter 3D');
                selectCard(cardId);
            } else if (index < currentCardIndex) {
                // Click card bên TRÁI -> Di chuyển 1 bước sang trái
                console.log('← Clicked Left Card -> Navigate Left');
                navigateCards(-1);
            } else {
                // Click card bên PHẢI -> Di chuyển 1 bước sang phải
                console.log('→ Clicked Right Card -> Navigate Right');
                navigateCards(1);
            }
        };
    });

    // WHEEL LOGIC (Scroll) - Lăn chuột để di chuyển
    let lastWheelTime = 0;
    container.onwheel = (e) => {
        // Throttle wheel events (500ms giữa mỗi lần)
        if (Date.now() - lastWheelTime < 500) return;
        lastWheelTime = Date.now();

        if (e.deltaY > 0) {
            navigateCards(1);  // Scroll xuống -> sang phải
        } else {
            navigateCards(-1); // Scroll lên -> sang trái
        }
    };

    console.log('✅ Card click + wheel handlers initialized for', cards.length, 'cards');
}

// Cập nhật goBack() để xử lý cả card timeline
function goBack() {
    // Nếu đang xem detail (thông tin chi tiết node)
    if (isInDetailView) {
        exitDetailView();
        return;
    }

    // Nếu đang xem timeline của một card cụ thể
    if (currentCardId !== null) {
        // Quay về carousel (không phải main timeline)
        exitTimelineView();
        return;
    }

    // Mặc định: về Welcome Screen
    resetToWelcome();
}

// ==========================================
// RESET VỀ WELCOME SCREEN
// ==========================================
function resetToWelcome() {
    // Ẩn tất cả UI
    document.getElementById('node-cards-container').style.display = 'none';
    document.getElementById('canvas-container').style.display = 'none';
    document.getElementById('header').style.display = 'none';
    document.getElementById('global-back-btn').style.display = 'none';

    const gesturePanel = document.getElementById('gesture-panel');
    if (gesturePanel) gesturePanel.style.display = 'none';

    // Hiện welcome
    document.getElementById('welcome-overlay').style.display = 'flex';

    // Stop tracking và reset state
    stopMediaPipe();

    // Reset physics state
    targetZoom = 1.0;
    currentZoom = 1.0;
    targetPan = { x: 0, y: 0 };
    panOffset = { x: 0, y: 0 };
    scrollVelocity = 0;
    prevPanPos = null;
    isHandActive = false;

    // Reset context
    currentGestureContext = GESTURE_CONTEXT.WELCOME;
    currentActiveCard = null;
    currentCardId = null;

    console.log('🏠 Reset to Welcome Screen');
}

// ==========================================
// NODE CLICK HANDLER - Raycaster để detect click trên nodes
// ==========================================
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function onCanvasClick(event) {
    // Chỉ xử lý khi đang ở timeline view và chưa mở detail
    if (isInDetailView || currentCardId === null) return;

    const rect = renderer.domElement.getBoundingClientRect();

    // Convert mouse position to normalized device coordinates (-1 to +1)
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Update raycaster
    raycaster.setFromCamera(mouse, camera);

    // Check for intersections with node meshes
    const intersects = raycaster.intersectObjects(nodeMeshes);

    if (intersects.length > 0) {
        const clickedNode = intersects[0].object;
        const nodeData = clickedNode.userData;

        console.log('🎯 Node clicked:', nodeData.title || nodeData.year);

        // Animate zoom before opening detail view
        animateNodeZoom(clickedNode, () => {
            openDetailView(nodeData);
        });
    }
}

// Add click listener when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Wait a bit for renderer to be created
    setTimeout(() => {
        const canvasContainer = document.getElementById('canvas-container');
        if (canvasContainer) {
            canvasContainer.addEventListener('click', onCanvasClick);
            console.log('✅ Node click handler attached to canvas');
        }
    }, 1000);
});
