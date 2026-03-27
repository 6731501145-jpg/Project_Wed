const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3000;

// อนุญาตให้หน้าเว็บ(Frontend) ส่งข้อมูลเข้ามาได้
app.use(cors());
app.use(express.json()); 

// ---------------------------------------------------------
// 🗄️ จำลองฐานข้อมูล (Mock Database) สำหรับทดสอบ
// ---------------------------------------------------------
let tablesDB = {
    "4": { // ข้อมูลโต๊ะ 4
        customerName: "Somchai Jaidee", // 🟢 1. เพิ่มชื่อลูกค้าตรงนี้
        canOrder: true, 
        items: [
            { menuName: "Pad Thai", price: 80, amount: 2 },
            { menuName: "Tom Yum Goong", price: 250, amount: 1 },
            { menuName: "Som Tum", price: 60, amount: 1 },
            { menuName: "Fried Chicken", price: 120, amount: 1 },
            { menuName: "Coke", price: 20, amount: 2 },
            { menuName: "Water", price: 15, amount: 1 },
            { menuName: "Mango Sticky Rice", price: 100, amount: 1 }
        ],
        paidAt: null,
        review: null
    }
};

// ---------------------------------------------------------
// 🚀 เริ่มสร้าง API 
// ---------------------------------------------------------

// 1. API ดึงข้อมูลบิลเพื่อแสดงหน้า PAYMENT.html
app.get('/api/checkout/:tableId', (req, res) => {
    const tableId = req.params.tableId;
    const tableData = tablesDB[tableId];

    if (!tableData) {
        return res.status(404).json({ message: "Table not found" });
    }

    // คำนวณราคารวม
    let totalPrice = 0;
    tableData.items.forEach(item => {
        totalPrice += (item.price * item.amount);
    });

    res.json({
        tableId: tableId,
        items: tableData.items,
        totalPrice: totalPrice,
        canOrder: tableData.canOrder
    });
});

// 2. API สำหรับกด "CHECK OUT" (ชำระเงิน)
app.post('/api/pay', (req, res) => {
    const { tableId } = req.body;

    if (!tablesDB[tableId]) {
        return res.status(404).json({ message: "Table not found" });
    }

    // บันทึกเวลาจ่ายเงิน และ ล็อกโต๊ะไม่ให้สั่งอาหารเพิ่ม (ตาม Requirement)
    tablesDB[tableId].paidAt = new Date().toISOString();
    tablesDB[tableId].canOrder = false; 

    res.json({
        success: true,
        message: "Payment successful!",
        paidAt: tablesDB[tableId].paidAt
    });
});

// 3. API สำหรับส่ง "REVIEW" (รวมโค้ดที่ซ้ำกันให้แล้วครับ)
app.post('/api/review', (req, res) => {
    const { tableId, rating, comment } = req.body;

    if (tablesDB[tableId]) {
        tablesDB[tableId].review = {
            rating: rating,
            comment: comment
        };
        
        // แสดงข้อความใน Terminal หลังบ้าน
        console.log(`[REVIEW] Table: ${tableId} | Rating: ${rating} stars | Comment: ${comment}`);
        
        res.json({ success: true, message: "Review saved successfully" });
    } else {
        res.status(404).json({ message: "Table not found" });
    }
});

// 4. API สำหรับดึงข้อมูลใบเสร็จ (หน้า HISTORY.html / history2.html)
app.get('/api/receipt/:tableId', (req, res) => {
    const tableId = req.params.tableId;
    const tableData = tablesDB[tableId];

    if (!tableData) {
        return res.status(404).json({ message: "Table not found" });
    }

    let totalPrice = 0;
    tableData.items.forEach(item => {
        totalPrice += (item.price * item.amount);
    });

    res.json({
        tableId: tableId,
        customerName: tableData.customerName, // 🟢 2. เพิ่มชื่อลูกค้าลงใน JSON เพื่อส่งไปให้หน้าเว็บ
        paidAt: tableData.paidAt,
        items: tableData.items,
        totalPrice: totalPrice,
        review: tableData.review
    });
});

// เปิดเซิร์ฟเวอร์
app.listen(PORT, () => {
    console.log(`✅ Server is running at http://localhost:${PORT}`);
});
