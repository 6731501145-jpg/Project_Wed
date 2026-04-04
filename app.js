const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const bcrypt = require('bcrypt');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// =========================================================
// 🗄️ 1. DATABASE CONNECTION
// =========================================================
const db = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'database_webdev_course',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

db.getConnection()
    .then(() => console.log('✅ Connected to MySQL Database successfully!'))
    .catch((err) => console.error('❌ MySQL Connection Error:', err.message));

// =========================================================
// 🔑 2. AUTHENTICATION & UTILS
// =========================================================

// API: สร้าง Password Hash (สำหรับ Test)
app.get('/password/:raw', async (req, res) => {
    try {
        const hashedPassword = await bcrypt.hash(req.params.raw, 10);
        res.status(200).send(hashedPassword);
    } catch (error) {
        res.status(500).send('Server error');
    }
});

// Admin Login
app.post('/admin/signin', async (req, res) => {
    try {
        const { admin_id, password } = req.body;
        const [rows] = await db.query('SELECT * FROM admin WHERE username = ?', [admin_id]);
        if (rows.length === 0) return res.status(401).send('Wrong Name or Password');
        const isMatch = await bcrypt.compare(password, rows[0].password_hash);
        if (!isMatch) return res.status(401).send('Wrong Name or Password');
        res.status(200).send('/public/admin/Dashdoard_admin.html');
    } catch (error) {
        res.status(500).send('Server error');
    }
});

// ==========================================
// 🧑‍🍳 3. COOK SECTION (ระบบกุ๊ก)
// ==========================================

// Register Cook
app.post('/cooks/register', async (req, res) => {
    try {
        const { cook_id, name, password } = req.body;
        const [existing] = await db.query('SELECT * FROM cook WHERE employee_id = ?', [cook_id]);
        if (existing.length > 0) return res.status(409).send('ID already exists');
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query(
            'INSERT INTO cook (employee_id, name, password_hash, is_active) VALUES (?, ?, ?, 1)',
            [cook_id, name, hashedPassword]
        );
        res.status(200).send('Registered successfully');
    } catch (error) {
        res.status(500).send('Server error');
    }
});

// Cook Login
app.post('/cooks/login', async (req, res) => {
    try {
        const { cook_id, password } = req.body;
        const [rows] = await db.query('SELECT * FROM cook WHERE employee_id = ?', [cook_id]);
        if (rows.length === 0) return res.status(401).send('Wrong CooksID or Password');
        const isMatch = await bcrypt.compare(password, rows[0].password_hash);
        if (!isMatch) return res.status(401).send('Wrong CooksID or Password');
        res.status(200).send('/public/cooks/Dashdoard_cook.html');
    } catch (error) {
        res.status(500).send('Server error');
    }
});

// ดึงรายการออเดอร์ทั้งหมดที่ยังไม่เสร็จ (พร้อมจัดกลุ่มรายการอาหาร)
app.get('/cook/orders', async (req, res) => {
    try {
        const sql = `
            SELECT o.order_id, t.table_number, o.status, m.name AS menu_name, COUNT(oi.menu_id) AS quantity
            FROM \`order\` o
            JOIN \`table\` t ON o.table_id = t.table_id
            JOIN order_item oi ON o.order_id = oi.order_id
            JOIN menu_item m ON oi.menu_id = m.menu_id
            WHERE o.status != 'serving'
            GROUP BY o.order_id, m.menu_id
        `;
        const [rows] = await db.query(sql);
        
        // จัดโครงสร้างข้อมูลใหม่ให้อ่านง่าย (Object Grouping)
        const orders = {};
        rows.forEach(row => {
            if (!orders[row.order_id]) {
                orders[row.order_id] = {
                    order_id: row.order_id,
                    table_number: row.table_number,
                    status: row.status,
                    items: []
                };
            }
            orders[row.order_id].items.push({ menu_name: row.menu_name, quantity: row.quantity });
        });
        res.status(200).json(Object.values(orders));
    } catch (error) {
        res.status(500).send('Server error');
    }
});

// ดูรายละเอียดออเดอร์เดี่ยว
app.get('/cook/order/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const sql = `
            SELECT o.order_id, t.table_number, o.status, m.name AS menu_name, COUNT(oi.menu_id) AS quantity
            FROM \`order\` o
            JOIN \`table\` t ON o.table_id = t.table_id
            JOIN order_item oi ON o.order_id = oi.order_id
            JOIN menu_item m ON oi.menu_id = m.menu_id
            WHERE o.order_id = ?
            GROUP BY m.menu_id
        `;
        const [result] = await db.query(sql, [id]);
        if (result.length === 0) return res.status(404).send('Order not found');
        res.status(200).json({
            order_id: result[0].order_id,
            table_number: result[0].table_number,
            status: result[0].status,
            items: result.map(r => ({ menu_name: r.menu_name, quantity: r.quantity }))
        });
    } catch (error) {
        res.status(500).send('Server error');
    }
});

// อัปเดตสถานะออเดอร์
app.patch('/cook/order/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const validStatus = ['pending', 'cooking', 'serving'];
    if (!validStatus.includes(status)) return res.status(400).send('Invalid status');
    try {
        await db.query('UPDATE `order` SET status = ? WHERE order_id = ?', [status, id]);
        res.status(200).send('Updated');
    } catch (error) {
        res.status(500).send('Updating failed');
    }
});

// ==========================================
// 🍽️ 4. CUSTOMER SECTION (ระบบลูกค้า)
// ==========================================

app.post('/customers/login', async (req, res) => {
    try {
        const { username, table_number } = req.body;
        if (!username || !table_number) return res.status(400).send('Missing data');
        await db.query('INSERT INTO customer (username, table_id, is_paid, created_at) VALUES (?, ?, 0, NOW())', [username, table_number]);
        res.status(200).send('/public/customers/Menu_customers.html');
    } catch (error) { res.status(500).send('Server error'); }
});

app.get('/customers/orders', async (req, res) => {
    try {
        const table_number = req.query.table;
        const [orders] = await db.query(`
            SELECT o.order_id, o.table_id AS table_number, m.name AS menu_name, o.status
            FROM \`order\` o
            JOIN order_item oi ON o.order_id = oi.order_id
            JOIN menu_item m ON oi.menu_id = m.menu_id
            WHERE o.table_id = ?
        `, [table_number]);
        res.status(200).json(orders);
    } catch (error) { res.status(500).send('Server error'); }
});

app.get('/customers/products', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT menu_id AS id, name, price, image_url AS image FROM menu_item WHERE is_active = 1');
        res.status(200).json(rows);
    } catch (error) { res.status(500).send('Server error'); }
});

app.get('/customers/search', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT menu_id AS id, name, price, image_url AS image FROM menu_item WHERE name LIKE ? AND is_active = 1', [`%${req.query.name}%`]);
        res.status(200).json(rows);
    } catch (error) { res.status(500).send('Search failed'); }
});

// ยืนยันการสั่งซื้อ (Transaction)
app.post('/customers/order/submit', async (req, res) => {
    const { cart, total, customer_id, table_id } = req.body;
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();
        const [orderResult] = await connection.query("INSERT INTO `order` (customer_id, table_id, total_price, status) VALUES (?, ?, ?, 'pending')", [customer_id, table_id, total]);
        const newOrderId = orderResult.insertId;
        for (const item of cart) {
            for (let i = 0; i < item.qty; i++) {
                await connection.query("INSERT INTO order_item (order_id, menu_id, price, customer_id) VALUES (?, ?, ?, ?)", [newOrderId, item.id, item.price, customer_id]);
            }
        }
        await connection.commit();
        res.status(200).json({ success: true, order_id: newOrderId });
    } catch (error) {
        if (connection) await connection.rollback();
        res.status(500).send('Error: ' + error.message);
    } finally {
        if (connection) connection.release();
    }
});

// ==========================================
// 👮 5. ADMIN SECTION (จัดการกุ๊ก & เมนู)
// ==========================================

// --- จัดการกุ๊ก ---
app.get('/admin/cooks/data', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT employee_id, name, is_active FROM cook');
        res.json(rows.map(c => ({ id: c.employee_id, fname: c.name.split(' ')[0], lname: c.name.split(' ')[1] || '', status: c.is_active ? 'active' : 'inactive' })));
    } catch (error) { res.status(500).send('Error'); }
});

app.post('/admin/cooks/add', async (req, res) => {
    const { fname, lname } = req.body;
    const fullName = `${fname.trim()} ${lname.trim()}`;
    try {
        const [existing] = await db.query('SELECT id FROM cook WHERE name = ? LIMIT 1', [fullName]);
        if (existing.length > 0) return res.status(400).send('มีพ่อครัวชื่อนี้อยู่ในระบบแล้ว');
        await db.query('INSERT INTO cook (employee_id, name, password_hash, is_active) VALUES (?, ?, "hash", 1)', ['EMP' + Date.now(), fullName]);
        res.status(200).send('เพิ่มเรียบร้อย');
    } catch (error) { res.status(500).send('Error'); }
});

app.put('/admin/cooks/:id', async (req, res) => {
    try {
        const [curr] = await db.query('SELECT name FROM cook WHERE employee_id = ?', [req.params.id]);
        const lname = curr[0].name.split(' ')[1] || '';
        await db.query('UPDATE cook SET name = ? WHERE employee_id = ?', [`${req.body.fname} ${lname}`, req.params.id]);
        res.send('Updated');
    } catch (error) { res.status(500).send('Error'); }
});

app.patch('/admin/cooks/:id', async (req, res) => {
    try {
        await db.query('UPDATE cook SET is_active = ? WHERE employee_id = ?', [req.body.active_status, req.params.id]);
        res.status(200).send('Status updated');
    } catch (error) { res.status(500).send('Error'); }
});

// --- จัดการเมนู ---
app.get('/admin/products', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT menu_id, name, price FROM menu_item');
        res.json(rows);
    } catch (error) { res.status(500).send('Error'); }
});

app.post('/admin/products', async (req, res) => {
    const { name, price, image_url } = req.body;
    try {
        const [existing] = await db.query('SELECT menu_id FROM menu_item WHERE name = ? LIMIT 1', [name.trim()]);
        if (existing.length > 0) return res.status(400).send('ชื่อสินค้าซ้ำ');
        await db.query('INSERT INTO menu_item (name, price, image_url, is_active) VALUES (?, ?, ?, 1)', [name.trim(), price, image_url]);
        res.status(201).send('Added');
    } catch (error) { res.status(500).send('Error'); }
});

app.put('/admin/products/:id', async (req, res) => {
    try {
        await db.query('UPDATE menu_item SET name = ?, price = ? WHERE menu_id = ?', [req.body.name, req.body.price, req.params.id]);
        res.send('Updated');
    } catch (error) { res.status(500).send('Error'); }
});

app.patch('/admin/products/:id', async (req, res) => {
    try {
        await db.query('UPDATE menu_item SET is_active = ? WHERE menu_id = ?', [req.body.active_status, req.params.id]);
        res.status(200).send('Status updated');
    } catch (error) { res.status(500).send('Error'); }
});

// --- โหลดหน้า HTML ---
app.get('/customers/menu', (req, res) => res.sendFile(path.join(__dirname, 'public', 'customers', 'Menu_customers.html')));
app.get('/customers/cart', (req, res) => res.sendFile(path.join(__dirname, 'public', 'customers', 'cart_customers.html')));
app.get('/admin/cooks', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'Menu_admin.html')));
app.get('/admin/menu', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'lisCook_admin.html')));

app.listen(3000, () => console.log('🚀 Server running on http://localhost:3000'));