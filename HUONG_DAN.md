# 📖 HƯỚNG DẪN CHỈNH SỬA NODE CHUYÊN SÂU

Tài liệu này hướng dẫn cách sửa **mọi thuộc tính** của node trong file `data.js`.

---

## 1. CẤU TRÚC ĐẦY ĐỦ CỦA MỘT NODE

Mỗi node trong `timelineNodes` có cấu trúc đầy đủ như sau (bạn có thể copy mẫu này):

```javascript
{
    // === 1. THÔNG TIN CƠ BẢN (Hiển thị trên Timeline) ===
    id: "1-1",                  // Mã duy nhất (bắt buộc)
    year: "Trước 1840s",        // Dòng 1: Năm/Mốc thời gian
    title: "Bối cảnh bấy giờ",  // Dòng 2: Tiêu đề ngắn
    position: "above",          // Vị trí: "above" (trên sóng) hoặc "below" (dưới sóng)
    offsetY: 20,                // Khoảng cách từ đường sóng (pixel)

    // === 2. TÙY CHỈNH GIAO DIỆN (Tùy chọn - nếu bỏ qua sẽ dùng mặc định) ===
    nodeRadius: 10,             // Kích thước chấm tròn (mặc định: 6-8)
    nodeColor: 0xFFD700,        // Màu chấm tròn (mặc định: màu của Card cha)
    labelScale: { x: 80, y: 18 }, // Kích cỡ khung chữ (x: rộng, y: cao)
    image: null,                // (Chưa dùng)

    // === 3. NỘI DUNG CHI TIẾT (Hiển thị khi bấm vào node) ===
    // Dữ liệu này hiển thị trong bảng Overlay
    description: "Đoạn văn mô tả chi tiết / Trích dẫn quan trọng.",
    
    // Danh sách các sự kiện con (bên trái overlay)
    events: [
        { 
            date: "1840", 
            title: "Sự kiện A", 
            desc: "Mô tả chi tiết sự kiện A..." 
        },
        { 
            date: "1842", 
            title: "Sự kiện B", 
            desc: "Mô tả chi tiết sự kiện B..." 
        }
    ],

    // Danh sách các mục con (bên phải overlay - Sub-nodes)
    subNodes: [
        { 
            label: "Chi tiết 1", 
            desc: "Nội dung chi tiết 1..." 
        },
        { 
            label: "Chi tiết 2", 
            desc: "Nội dung chi tiết 2..." 
        }
    ]
}
```

---

## 2. GIẢI THÍCH CHI TIẾT TỪNG THUỘC TÍNH

### A. Nhóm Hiển thị trên Line (Timeline)

| Thuộc tính | Kiểu | Mô tả |
|------------|------|-------|
| `id` | String | **Bắt buộc**. Mã định danh (vd: "1-1", "1-2"). Không được trùng lặp. |
| `year` | String | Dòng chữ đầu tiên trên nhãn node (thường là năm). |
| `title` | String | Dòng chữ thứ hai trên nhãn node (tiêu đề ngắn). |
| `position` | String | `"above"`: Node nằm trên đường lượn sóng.<br>`"below"`: Node nằm dưới đường lượn sóng. |
| `offsetY` | Number | Khoảng cách từ tim đường sóng đến tâm node (pixel).<br>- `10`: Rất gần<br>- `20-30`: Trung bình<br>- `50+`: Xa |
| `nodeRadius` | Number | Độ to của chấm tròn.<br>- `null`: Tự động (6-8)<br>- `10-12`: To nổi bật |
| `nodeColor` | Hex | Màu của chấm tròn. Vd: `0xFF0000` (Đỏ).<br>- `null`: Lấy theo màu của Card (Thẻ lớn). |
| `labelScale` | Object | Kích thước khung chứa chữ.<br>- `{x: 60, y: 13}`: Nhỏ (Mặc định)<br>- `{x: 100, y: 25}`: Rất to (Cho tiêu đề dài) |

### B. Nhóm Nội dung Chi tiết (Overlay)

Các thuộc tính này **ẩn** trên timeline, chỉ hiện ra khi **click vào node**.

| Thuộc tính | Kiểu | Mô tả |
|------------|------|-------|
| `description` | String | Đoạn văn bản hiển thị dưới tiêu đề lớn trong Overlay. Thường là trích dẫn hoặc tóm tắt. |
| `events` | Array | Danh sách các sự kiện (timeline dọc bên trái Overlay).<br>Mỗi item gồm: `{date, title, desc}` |
| `subNodes` | Array | Danh sách các nút con (bên phải Overlay).<br>Mỗi item gồm: `{label, desc}` |

---

## 3. VÍ DỤ THỰC TẾ

### Node đơn giản (chỉ có timeline)
```javascript
{
    id: "1-1",
    year: "1840",
    title: "Sự kiện A",
    position: "above",
    offsetY: 20
}
```

### Node đầy đủ (full option)
```javascript
{
    id: "1-2",
    year: "1848",
    title: "Tuyên ngôn Đảng CS",
    position: "below",
    offsetY: 40,
    nodeRadius: 12,           // Node to nổi bật
    nodeColor: 0xFF0000,      // Màu đỏ
    
    // Nội dung chi tiết
    description: "Vô sản toàn thế giới, đoàn kết lại!",
    
    events: [
        { date: "Tháng 2", title: "Xuất bản", desc: "Tại London..." }
    ],
    
    subNodes: [
        { label: "Ý nghĩa", desc: "Văn kiện cương lĩnh đầu tiên..." },
        { label: "Tác giả", desc: "Marx và Engels" }
    ]
}
```

---

## 4. MẸO CHỈNH SỬA

1.  **Chỉnh độ cong sóng (Wave Amplitude):**
    - Sửa ở cấp **Card** (Thẻ lớn): `waveAmplitude: 30`
    - Tăng lên `50-60` để sóng uốn lượn mạnh hơn.
    - Giảm xuống `10-20` để sóng phẳng hơn.

2.  **Làm node so le đẹp mắt:**
    - Hãy đặt `position` xen kẽ: `above` → `below` → `above`...
    - Chỉnh `offsetY` khác nhau một chút (vd: 20, 35, 20, 35...) để tạo nhịp điệu tự nhiên.

3.  **Thay màu từng phần:**
    - Bạn có thể làm nổi bật một node quan trọng bằng cách gán `nodeColor` riêng (vd màu vàng `0xFFFF00`) trong khi các node khác để `null` (theo màu chủ đạo).