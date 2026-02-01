// ==========================================
// 1. CONFIGURATION
// ==========================================
const CONFIG = {
    particleCount: 1000,
    nodeParticleCount: 25,  // Giảm từ 50 → 25 (giảm thêm 50% tính toán)
    timelineLength: 300,
    branchSpacing: 40,
    nodeRadius: 50,
    zoomMin: 0.3,
    zoomMax: 3.0,

    // === PHYSICS ENGINE ===
    ZOOM_SMOOTHING: 0.1,      // Độ mượt phóng to (0.05-0.2)
    PAN_SMOOTHING: 0.12,      // Độ mượt kéo (0.08-0.15)
    SCROLL_FRICTION: 0.96,    // Ma sát cuộn (0.9-0.98)
    SCROLL_DEADZONE: 0.0015,  // Vùng chết lọc nhiễu
    CURSOR_SMOOTHING: 0.15,   // LERP cho cursor (lọc rung)

    // === GESTURE COOLDOWNS ===
    SWIPE_COOLDOWN: 800,      // ms giữa các lần vuốt
    BACK_COOLDOWN: 1000,      // ms giữa các lần back
    SWIPE_THRESHOLD: 0.08,    // Ngưỡng vuốt (normalized)

    // === ZOOM SENSITIVITY ===
    ZOOM_IN_SPEED: 0.02,      // Tốc độ phóng to (thumb/pinch)
    ZOOM_OUT_SPEED: 0.015     // Tốc độ thu nhỏ (fist)
};

// Prevent init3D from running multiple times
let isInit3DCompleted = false;

// ==========================================
// DOM ELEMENT CACHE (Performance optimization)
// ==========================================
const DOM = {
    canvasContainer: null,
    status: null,
    nodeCardsContainer: null,
    gesturePanel: null,
    header: null,
    globalBackBtn: null,
    welcomeOverlay: null,
    cameraPreview: null,
    title: null
};

function cacheDOMElements() {
    DOM.canvasContainer = document.getElementById('canvas-container');
    DOM.status = document.getElementById('status');
    DOM.nodeCardsContainer = document.getElementById('node-cards-container');
    DOM.gesturePanel = document.getElementById('gesture-panel');
    DOM.header = document.getElementById('header');
    DOM.globalBackBtn = document.getElementById('global-back-btn');
    DOM.welcomeOverlay = document.getElementById('welcome-overlay');
    DOM.cameraPreview = document.getElementById('camera-preview');
    DOM.title = document.getElementById('title');
}

// sửa node ở đây
// ==========================================
// CẤU TRÚC MỚI:
// - Mỗi CARD (thẻ) có một mảng timelineNodes riêng
// - Mỗi node con có: year, title (label), position, offsetY, image
// - position xen kẽ: above → below → above...
// - Label có khung với nền mờ ở phía ĐỐI NGHỊCH với node
// ==========================================
const timelineData = {
    // 6 CARDS chính (hiển thị trong carousel)
    cards: [
        {
            id: 1,
            title: "Trước 1840s – 1890s: Sự ra đời và hoàn thiện của chủ nghĩa Marx",
            desc: "Sự ra đời và hoàn thiện của chủ nghĩa Marx",
            color: 0xFF6B6B,
            // === TÙY CHỈNH ĐỘ CONG SÓNG CHO TIMELINE NÀY ===
            waveAmplitude: 30,  // Độ cao sóng (px). null = tự động, số lớn = cong hơn
            // CÁC NODE CON của card này (hiển thị khi click vào card)
            timelineNodes: [
                {
                    id: "1-1",
                    year: "Trước 1840s",
                    title: "Bối cảnh bấy giờ",
                    position: "above",
                    // === TÙY CHỈNH RIÊNG CHO NODE NÀY ===
                    offsetY: 40,           // Khoảng cách từ line (pixel)
                    nodeRadius: 25,      // null = dùng mặc định, hoặc số (vd: 10)
                    labelScale: { x: 80, y: 18 },      // null = mặc định, hoặc {x: 60, y: 13}
                    nodeColor: null,       // null = dùng màu card, hoặc hex (vd: 0xFF0000)
                    image: "image/lenin.jpg",

                    // === TÙY CHỈNH QUỸ ĐẠO HẠT (Bán kính bay) ===
                    orbitMin: 10,   // Bay gần nhất = 3 lần bán kính node (Bay xa)
                    orbitMax: 30    // Bay xa nhất = 6 lần bán kính node (Bay rất xa)
                },
                {
                    id: "1-2",
                    year: "1840s – 1850s",
                    title: "Sự ra đời của chủ nghĩa Marx",
                    position: "below",
                    offsetY: 40,
                    nodeRadius: 25,
                    labelScale: null,
                    nodeColor: null,
                    image: "image/lenin.jpg",

                    // Node này dùng mặc định (bay gần)
                },
                {
                    id: "1-3",
                    year: "1860s – 1890s",
                    title: "Hoàn thiện học thuyết Marx",
                    position: "above",
                    offsetY: 40,
                    nodeRadius: 25,
                    labelScale: null,
                    nodeColor: null,
                    image: "image/lenin.jpg"
                }
            ]
        },
        {
            id: 2,
            title: "1900s – 1920s: Từ lý luận Marx đến thực tiễn Lenin",
            desc: "Từ lý luận Marx đến thực tiễn Lenin",
            color: 0x4ECDC4,
            timelineNodes: [
                {
                    id: "2-1",
                    year: "1870–1900",
                    title: "Bối cảnh bấy giờ",
                    position: "above",
                    offsetY: 20,
                    image: null,
                    
                },
                {
                    id: "2-2",
                    year: "1898 – 1918",
                    title: "Đảng Lao động Dân chủ Xã hội Nga",
                    position: "below",
                    offsetY: 20,
                    image: null
                },
                {
                    id: "2-3",
                    year: "1905 – 1907",
                    title: "Cách mạng Nga",
                    position: "above",
                    offsetY: 20,
                    image: null
                },
                {
                    id: "2-4",
                    year: "1914–1917",
                    title: "Nước Nga trong chiến tranh thế giới thứ nhất",
                    position: "below",
                    offsetY: 20,
                    image: null
                },
                {
                    id: "2-5",
                    year: "1917",
                    title: "Cách mạng Tháng Mười Nga",
                    position: "above",
                    offsetY: 20,
                    image: null
                },
                {
                    id: "2-6",
                    year: "1919",
                    title: "Thành lập Quốc tế Cộng sản",
                    position: "below",
                    offsetY: 20,
                    image: null
                }
            ]
        },
        {
            id: 3,
            title: "1920s – 1945: Củng cố mô hình XHCN \n và ảnh hưởng trong phong trào cách mạng thế giới",
            desc: "Củng cố mô hình XHCN và ảnh hưởng trong phong trào cách mạng thế giới",
            color: 0xFFE66D,
            timelineNodes: [
                {
                    id: "3-1",
                    year: "1921",
                    title: "Thành lập Đảng Cộng sản Trung Quốc",
                    position: "above",
                    offsetY: 20,
                    image: null
                },
                {
                    id: "3-2",
                    year: "1922",
                    title: "Liên bang Xô Viết ra đời",
                    position: "below",
                    offsetY: 20,
                    image: null
                },
                {
                    id: "3-3",
                    year: "1924",
                    title: "Lenin qua đời",
                    position: "above",
                    offsetY: 20,
                    image: null
                },
                {
                    id: "3-4",
                    year: "1930",
                    title: "Thành lập Đảng Cộng sản Việt Nam",
                    position: "below",
                    offsetY: 20,
                    image: null
                },
                {
                    id: "3-5",
                    year: "1939 – 1945",
                    title: "Vai trò của các nước XHCN trong Thế chiến II",
                    position: "above",
                    offsetY: 20,
                    image: null
                },
                {
                    id: "3-6",
                    year: "1945",
                    title: "Cách mạng Tháng Tám thành công (Việt Nam)",
                    position: "below",
                    offsetY: 20,
                    image: null
                },
                {
                    id: "3-7",
                    year: "1948",
                    title: "Cộng hòa Dân chủ Nhân dân Triều Tiên",
                    position: "above",
                    offsetY: 20,
                    image: null
                },
                {
                    id: "3-8",
                    year: "1949",
                    title: "Cộng hòa Nhân dân Trung Hoa",
                    position: "below",
                    offsetY: 20,
                    image: null
                }
            ]
        },
        {
            id: 4,
            title: "1947 – 1970s: Mở rộng hệ thống XHCN trong bối cảnh Chiến tranh Lạnh",
            desc: "Mở rộng hệ thống XHCN trong bối cảnh Chiến tranh Lạnh",
            color: 0x95E1D3,
            timelineNodes: [
                {
                    id: "4-1",
                    year: "",
                    title: "Bối cảnh bấy giờ",
                    position: "above",
                    offsetY: 12,
                    image: null
                },
                {
                    id: "4-2",
                    year: "1947",
                    title: "Học thuyết Truman: Khởi đầu chính thức Chiến tranh Lạnh",
                    position: "below",
                    offsetY: 12,
                    image: null
                },
                {
                    id: "4-3",
                    year: "1949–1961",
                    title: "Hình thành thế cân bằng siêu cường Mỹ – Liên Xô",
                    position: "above",
                    offsetY: 12,
                    image: null
                },
                {
                    id: "4-4",
                    year: "1959",
                    title: "Cách mạng Cuba thắng lợi",
                    position: "below",
                    offsetY: 12,
                    image: null
                },
                {
                    id: "4-5",
                    year: "1975 – 1976",
                    title: "Việt Nam kháng chiến thắng lợi - nước CHXHCN Việt Nam ra đời",
                    position: "above",
                    offsetY: 12,
                    image: null
                },
                {
                    id: "4-6",
                    year: "1975",
                    title: "Nước Cộng hòa Dân chủ Nhân dân Lào ra đời",
                    position: "below",
                    offsetY: 12,
                    image: null
                }
            ]
        },
        {
            id: 5,
            title: "1980s – 2000s: Khủng hoảng và tan rã của hệ thống XHCN Đông Âu – Liên Xô.\nTái định hình con đường phát triển của các nước XHCN còn lại",
            desc: "Khủng hoảng và tan rã của hệ thống XHCN Đông Âu – Liên Xô. Tái định hình con đường phát triển của các nước XHCN còn lại",
            color: 0xF38181,
            timelineNodes: [
                {
                    id: "5-1",
                    year: "",
                    title: "Bối cảnh bấy giờ",
                    position: "above",
                    offsetY: 12,
                    image: null
                },
                {
                    id: "5-2",
                    year: "1978",
                    title: "Trung Quốc khởi động cải cách và mở cửa",
                    position: "below",
                    offsetY: 12,
                    image: null
                },
                {
                    id: "5-3",
                    year: "1986",
                    title: "Việt Nam phát động công cuộc Đổi mới",
                    position: "above",
                    offsetY: 12,
                    image: null
                },
                {
                    id: "5-4",
                    year: "1989",
                    title: "Sụp đổ dây chuyền Đông Âu",
                    position: "below",
                    offsetY: 12,
                    image: null
                },
                {
                    id: "5-5",
                    year: "1991",
                    title: "Liên Xô tan rã",
                    position: "above",
                    offsetY: 12,
                    image: null
                },
                {
                    id: "5-6",
                    year: "Đầu thập niên 1990",
                    title: "Tái cấu trúc các nước XHCN còn lại",
                    position: "below",
                    offsetY: 12,
                    image: null
                }
            ]
        },
        {
            id: 6,
            title: "2000s – nay: Tác động đương đại của chủ nghĩa Marx–Lenin trong bối cảnh toàn cầu",
            desc: "Tác động đương đại của chủ nghĩa Marx–Lenin trong bối cảnh toàn cầu",
            color: 0xAA96DA,
            timelineNodes: [
                {
                    id: "6-1",
                    year: "",
                    title: "Ảnh hưởng về kinh tế: Sự dịch chuyển trọng tâm tăng trưởng toàn cầu",
                    position: "above",
                    offsetY: 12,
                    image: null
                },
                {
                    id: "6-2",
                    year: "",
                    title: "Ảnh hưởng về chính trị – ngoại giao: Xu hướng hình thành thế giới đa cực",
                    position: "below",
                    offsetY: 12,
                    image: null
                },
                {
                    id: "6-3",
                    year: "",
                    title: "Ảnh hưởng về mô hình xã hội: Nhấn mạnh con người là trung tâm phát triển",
                    position: "above",
                    offsetY: 12,
                    image: null
                },
                {
                    id: "6-4",
                    year: "",
                    title: "Ảnh hưởng về Lý luận: Gợi mở con đường phát triển mới",
                    position: "below",
                    offsetY: 12,
                    image: null
                }
            ]
        }
    ],

    // ==========================================
    // Legacy nodes (for backward compatibility)
    // Đây là các node hiển thị trên timeline 3D tổng quan
    // ==========================================
    nodes: [
        { id: 1, label: "Ra đời", year: "1840s-1890s", desc: "Sự ra đời của chủ nghĩa Marx", x: -200, position: "above", offsetY: 40, image: null, color: 0xFF6B6B },
        { id: 2, label: "Thực tiễn", year: "1900s-1920s", desc: "Từ lý luận đến thực tiễn", x: -120, position: "below", offsetY: 45, image: null, color: 0x4ECDC4 },
        { id: 3, label: "Củng cố", year: "1920s-1945", desc: "Củng cố mô hình XHCN", x: -40, position: "above", offsetY: 50, image: null, color: 0xFFE66D },
        { id: 4, label: "Mở rộng", year: "1947-1970s", desc: "Mở rộng hệ thống XHCN", x: 40, position: "below", offsetY: 55, image: null, color: 0x95E1D3 },
        { id: 5, label: "Tái định hình", year: "1980s-2000s", desc: "Khủng hoảng và đổi mới", x: 120, position: "above", offsetY: 45, image: null, color: 0xF38181 },
        { id: 6, label: "Đương đại", year: "2000s-nay", desc: "Tác động đương đại", x: 200, position: "below", offsetY: 50, image: null, color: 0xAA96DA }
    ],

    // Các đường nối giữa các mốc thời gian chính để thể hiện tiến trình lịch sử liên tục
    connections: [
        { from: 1, to: 2 },
        { from: 2, to: 3 },
        { from: 3, to: 4 },
        { from: 4, to: 5 },
        { from: 5, to: 6 }
    ]
};
