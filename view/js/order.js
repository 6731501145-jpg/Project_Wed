const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json()); // อนุญาตให้รับข้อมูลแบบ JSON ได้

// ตั้งค่าการเชื่อมต่อฐานข้อมูล MySQL
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root', // เปลี่ยนเป็น username ของคุณถ้าไม่ใช่ root
    password: '', // ใส่รหัสผ่านถ้ามี
    database: 'database_webdev_course' // ชื่อฐานข้อมูลจากในรูป
});

db.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL:', err);
        return;
    }
    console.log('Connected to MySQL Database!');
});

// API 1: ดึงข้อมูลออเดอร์ตามสถานะ (GET)
// วิธีใช้: http://localhost:3000/api/orders/pending
app.get('/api/orders/:status', (req, res) => {
    const status = req.params.status;
    // ใช้เครื่องหมาย backtick (`) ครอบคำว่า order เพราะเป็นคำสงวนใน SQL
    const sql = "SELECT * FROM `order` WHERE status = ?";
    
    db.query(sql, [status], (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// API 2: อัปเดตสถานะออเดอร์ (PUT)
app.put('/api/orders/:id/status', (req, res) => {
    const orderId = req.params.id;
    const newStatus = req.body.status; // เช่น 'cooking' หรือ 'done'

    const sql = "UPDATE `order` SET status = ? WHERE order_id = ?";
    
    db.query(sql, [newStatus, orderId], (err, result) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ message: 'Status updated successfully' });
    });
});

// เปิดเซิร์ฟเวอร์ที่พอร์ต 3000
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
