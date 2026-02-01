# 📖 CẬP NHẬT: QUỸ ĐẠO HẠT & ĐỘ TRONG SUỐT

## 1. Quỹ đạo hạt (Particles) Chuyên sâu
Bạn có thể tự chỉnh khoảng cách bay của hạt so với node bằng 2 tham số: `orbitMin` và `orbitMax`.
- **1.0**: Bay sát mép node.
- **2.0**: Bay cách tâm node 2 lần bán kính.

### Code mẫu:

```javascript
{
    id: "1-1",
    year: "1840",
    title: "Node Siêu Hạt",
    position: "above",
    nodeRadius: 30, // Node to

    // === TÙY CHỈNH QUỸ ĐẠO ===
    orbitMin: 1.5,   // Bay gần nhất = 1.5 lần bán kính (45px)
    orbitMax: 4.0,   // Bay xa nhất  = 4.0 lần bán kính (120px) -> Bay rất rộng!
    
    // === ĐỘ TRONG SUỐT ===
    opacity: 0.8,
    image: "image/lenin.jpg"
}
```

---

## 2. Tùy chỉnh Độ trong suốt (Opacity)
Giờ bạn có thể chỉnh độ mờ/đậm của node (và ảnh bên trong) bằng thuộc tính `opacity`.
- **`opacity: 1.0`**: Đậm đặc.
- **`opacity: 0.5`**: Bán trong suốt.
