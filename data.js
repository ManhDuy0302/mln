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
    ZOOM_OUT_SPEED: 0.015,    // Tốc độ thu nhỏ (fist)

    // === CAMERA ZONE MAPPING ===
    // Dùng vùng giữa camera để map ra toàn màn hình
    // Giúp tay không cần đưa sát mép camera mà vẫn điều khiển được mép màn hình
    // 0.15 = 15% margin → Vùng camera từ 15%-85% sẽ map ra 0%-100% màn hình
    // Tăng giá trị = vùng nhỏ hơn, di chuyển ít hơn = nhạy hơn
    // Giảm giá trị = vùng lớn hơn, cần di chuyển nhiều hơn
    CAMERA_MARGIN: 0.33
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
    title: null,
    conclusionOverlay: null
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
    DOM.conclusionOverlay = document.getElementById('conclusion-overlay');
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
            // === KẾT LUẬN CHO GIAI ĐOẠN NÀY ===
            conclusion: `
                <h2>🔴 Kết luận giai đoạn 1840s – 1890s</h2>
                <p>Chủ nghĩa Marx ra đời trong bối cảnh châu Âu đang trải qua những biến đổi sâu sắc về kinh tế - xã hội do cuộc Cách mạng công nghiệp.</p>
                <ul>
                    <li><strong>Về triết học:</strong> Marx đã kế thừa và phát triển phép biện chứng của Hegel, đồng thời phê phán và cải tạo chủ nghĩa duy vật của Feuerbach.</li>
                    <li><strong>Về kinh tế chính trị:</strong> Học thuyết giá trị thặng dư được coi là phát kiến vĩ đại nhất của Marx.</li>
                    <li><strong>Về chủ nghĩa xã hội:</strong> Marx và Engels đã biến chủ nghĩa xã hội từ không tưởng thành khoa học.</li>
                </ul>
                <p><em>Đây là nền tảng lý luận quan trọng cho sự phát triển của phong trào cộng sản và công nhân quốc tế.</em></p>
            `,
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
            conclusion: `
                <h2>🔵 Kết luận giai đoạn 1900s – 1920s</h2>
                <p>Giai đoạn này đánh dấu bước chuyển quan trọng từ lý luận sang thực tiễn cách mạng.</p>
                <ul>
                    <li><strong>Lenin phát triển chủ nghĩa Marx:</strong> Hoàn thiện học thuyết về đảng kiểu mới, về chủ nghĩa đế quốc.</li>
                    <li><strong>Cách mạng Tháng Mười 1917:</strong> Lần đầu tiên trong lịch sử, giai cấp công nhân giành được chính quyền.</li>
                    <li><strong>Quốc tế Cộng sản (1919):</strong> Phong trào cộng sản trở thành phong trào quốc tế có tổ chức.</li>
                </ul>
                <p><em>Thắng lợi của Cách mạng Tháng Mười đã mở ra thời đại mới - thời đại quá độ từ chủ nghĩa tư bản lên chủ nghĩa xã hội.</em></p>
            `,
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
            conclusion: `
                <h2>🟡 Kết luận giai đoạn 1920s – 1945</h2>
                <p>Đây là giai đoạn củng cố và mở rộng ảnh hưởng của chủ nghĩa Marx-Lenin trên phạm vi toàn cầu.</p>
                <ul>
                    <li><strong>Liên Xô xây dựng CNXH:</strong> Công nghiệp hóa, tập thể hóa nông nghiệp, xây dựng nền tảng vật chất cho CNXH.</li>
                    <li><strong>Phong trào cộng sản lan rộng:</strong> Đảng Cộng sản Trung Quốc (1921), Đảng Cộng sản Việt Nam (1930) ra đời.</li>
                    <li><strong>Vai trò trong Thế chiến II:</strong> Liên Xô đóng vai trò quyết định trong việc đánh bại chủ nghĩa phát xít.</li>
                    <li><strong>Cách mạng Tháng Tám 1945:</strong> Việt Nam giành độc lập, mở đầu sự sụp đổ của hệ thống thuộc địa.</li>
                </ul>
                <p><em>Chủ nghĩa Marx-Lenin đã chứng minh sức sống mạnh mẽ trong thực tiễn đấu tranh giải phóng dân tộc.</em></p>
            `,
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
            conclusion: `
                <h2>🟢 Kết luận giai đoạn 1947 – 1970s</h2>
                <p>Chiến tranh Lạnh đã định hình cục diện thế giới hai cực, với hệ thống XHCN mở rộng mạnh mẽ.</p>
                <ul>
                    <li><strong>Hệ thống XHCN thế giới:</strong> Từ một nước (Liên Xô) phát triển thành hệ thống gồm nhiều quốc gia ở Đông Âu, châu Á, châu Mỹ Latin.</li>
                    <li><strong>Cách mạng Cuba (1959):</strong> CNXH lan đến "sân sau" của Mỹ.</li>
                    <li><strong>Phong trào giải phóng dân tộc:</strong> Nhiều quốc gia châu Á, châu Phi giành độc lập với sự hỗ trợ của phe XHCN.</li>
                    <li><strong>Việt Nam (1975):</strong> Thắng lợi vĩ đại của nhân dân Việt Nam, chứng minh sức mạnh của ý chí độc lập dân tộc kết hợp với CNXH.</li>
                </ul>
                <p><em>Giai đoạn này chứng kiến sự phát triển đỉnh cao về quy mô của hệ thống XHCN thế giới.</em></p>
            `,
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
            conclusion: `
                <h2>🔴 Kết luận giai đoạn 1980s – 2000s</h2>
                <p>Đây là giai đoạn thử thách khốc liệt nhất của phong trào XHCN thế giới.</p>
                <ul>
                    <li><strong>Nguyên nhân khủng hoảng:</strong> Mô hình kế hoạch hóa tập trung bộc lộ nhiều hạn chế, không theo kịp cuộc cách mạng khoa học - công nghệ.</li>
                    <li><strong>Liên Xô tan rã (1991):</strong> Sự kiện làm thay đổi cục diện thế giới, kết thúc Chiến tranh Lạnh.</li>
                    <li><strong>Bài học lịch sử:</strong> CNXH phải gắn liền với thực tiễn, không ngừng đổi mới để phù hợp với điều kiện cụ thể.</li>
                    <li><strong>Đổi mới thành công:</strong> Trung Quốc (1978), Việt Nam (1986) tiến hành cải cách, mở cửa, đạt được những thành tựu to lớn.</li>
                </ul>
                <p><em>Sự sụp đổ của mô hình XHCN ở Đông Âu - Liên Xô không phải là sự sụp đổ của CNXH, mà là sự sụp đổ của một mô hình cụ thể.</em></p>
            `,
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
            conclusion: `
                <h2>🟣 Kết luận giai đoạn 2000s – Nay</h2>
                <p>Trong thế kỷ 21, chủ nghĩa Marx-Lenin vẫn tiếp tục có những đóng góp quan trọng cho sự phát triển của nhân loại.</p>
                <ul>
                    <li><strong>Kinh tế:</strong> Trung Quốc trở thành nền kinh tế lớn thứ hai thế giới, Việt Nam đạt tăng trưởng ấn tượng.</li>
                    <li><strong>Chính trị:</strong> Xu hướng đa cực hóa, thách thức trật tự đơn cực do Mỹ chi phối.</li>
                    <li><strong>Xã hội:</strong> Mô hình phát triển lấy con người làm trung tâm ngày càng được quan tâm.</li>
                    <li><strong>Lý luận:</strong> Chủ nghĩa Marx-Lenin tiếp tục được nghiên cứu, phát triển phù hợp với điều kiện mới.</li>
                </ul>
                <p><em>Chủ nghĩa Marx-Lenin không phải là giáo điều cứng nhắc, mà là kim chỉ nam cho hành động, cần được vận dụng sáng tạo vào thực tiễn từng quốc gia.</em></p>
            `,
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
