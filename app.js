const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const bcrypt = require('bcrypt');
const app = express();
const session = require('express-session');
const MemoryStore = require('memorystore')(session);

app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/view', express.static(path.join(__dirname, 'view')));
// mi
const isCustomerAuth = (req, res, next) => {
    if (req.session.customer_id) {
        next();
    } else {
        res.redirect('/'); // หรือหน้า login
    }
};
// ใช้กับ API ฝั่งลูกค้าเพื่อบังคับให้มี session เสมอ
const ensureCustomerSession = (req, res, next) => {
    if (!req.session.customer_id || !req.session.table_id) {
        return res.status(401).send('Customer session expired');
    }
    next();
};
// =========================================================
// 🗄️ 1. DATABASE CONNECTION
// =========================================================
const db = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'database_webdev_course',
    port: 3307, //3306 is default MySQL port
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

db.getConnection()
    .then(() => console.log('✅ Connected to MySQL Database successfully!'))
    .catch((err) => console.error('❌ MySQL Connection Error:', err.message));

// =========================================================
// 🗄️ 1.1 configure session
// =========================================================
app.use(session({
    cookie: { maxAge: 24 * 60 * 60 * 1000 },
    secret: 'webappis2easy',
    resave: false,
    saveUninitialized: true,
    store: new MemoryStore({
        checkPeriod: 24 * 60 * 60 * 1000
    })
}));

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
        const { admin_username, password } = req.body;
        const [rows] = await db.query('SELECT * FROM admin WHERE username = ?', [admin_username]);
        
        if (rows.length === 0) return res.status(401).send('Wrong Name');
        
        const isMatch = await bcrypt.compare(password, rows[0].password_hash);
        if (!isMatch) return res.status(401).send('Wrong Password');

        // 🔥 สิ่งที่แก้ไข: ต้องตั้งค่า Session ให้เป็น admin เพื่อให้เข้าหน้า Dashboard ได้
        req.session.username = rows[0].username;
        req.session.role = 'admin';

        // 🔥 สิ่งที่แก้ไข: ส่ง Path เส้นทางจำลอง (Route) กลับไป ไม่ใช่ Path ไฟล์ตรงๆ
        res.status(200).send('/admin/dashboard');
    } catch (error) {
        console.error(error);
        res.status(500).send('Server error');
    }
});

// ==========================================
// 🧑‍🍳 3. COOK SECTION (ระบบกุ๊ก)
// ==========================================
// Logout และส่งกลับหน้า index.html
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) return res.status(500).send('Cannot logout');

        // ลบคุกกี้ชื่อ connect.sid (ชื่อมาตรฐานของ express-session)
        res.clearCookie('connect.sid');

        // ส่งกลับหน้าแรก
        res.redirect('/');
    });
});

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
    const { name, password } = req.body;
    const sql = "SELECT employee_id, name, password_hash FROM cook WHERE name = ?";

    try {
        const [results] = await db.query(sql, [name]);

        if (results.length !== 1) {
            return res.status(401).send('Wrong Name');
        }

        const isMatch = await bcrypt.compare(password, results[0].password_hash);

        if (!isMatch) {
            return res.status(401).send('Wrong Password');
        }

        req.session.user_id = results[0].employee_id;
        req.session.username = results[0].name;
        req.session.role = 'cook';

        if (req.session.role === 'cook') {
            res.send('/cook/dashboard');
        } else {
            res.send('/');
        }

    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

// get cook/user info from session
app.get('/user/info', (req, res) => {
    // 1. ตรวจสอบว่ามีการ Login หรือไม่
    if (!req.session.user_id) {
        return res.status(401).json({ error: 'Unauthorized: Please login first' });
    }

    // 2. ดึงข้อมูลจาก Session ออกมาส่งให้ Front-end
    const { user_id, username, role } = req.session;

    // 3. ส่งข้อมูลกลับไปในรูปแบบ JSON
    res.status(200).json({
        user_id,
        username,
        role
    });
});

// ดึงรายการออเดอร์ทั้งหมดที่ยังไม่เสร็จ (พร้อมจัดกลุ่มรายการอาหาร)
app.get('/cook/orders', async (req, res) => {
    try {
        const { status } = req.query; // รับค่า 'pending' จาก Query String

        let sql = `
            SELECT o.order_id, t.table_number, o.status, m.name AS menu_name, COUNT(oi.menu_id) AS quantity
            FROM \`order\` o
            JOIN \`table\` t ON o.table_id = t.table_id
            JOIN order_item oi ON o.order_id = oi.order_id
            JOIN menu_item m ON oi.menu_id = m.menu_id
        `;

        // ถ้ามีการส่ง status มา (เช่น ?status=pending) ให้กรองข้อมูล
        if (status) {
            sql += ` WHERE o.status = ? `;
        }

        sql += ` GROUP BY o.order_id, m.menu_id `;

        const [rows] = await db.query(sql, status ? [status] : []);

        // --- ส่วนการจัดกลุ่มข้อมูล (Grouping) ---
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
            orders[row.order_id].items.push({
                menu_name: row.menu_name,
                quantity: row.quantity
            });
        });

        res.status(200).json(Object.values(orders));
    } catch (error) {
        console.error(error);
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

// ออเดอร์ที่เสิร์ฟแล้ววันนี้ dashboard
app.get('/api/cook/order/today', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT COUNT(oi.order_item_id) as total_qty 
            FROM order_item oi 
            JOIN \`order\` o ON oi.order_id = o.order_id 
            WHERE o.status IN ('serving') AND DATE(o.order_time) = CURDATE()
        `);
        res.status(200).json({ total_qty: rows[0].total_qty || 0 });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// top-menu dashboard
app.get('/api/cook/top-menus/today', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT m.menu_id as id, m.name, m.image_url as image, COUNT(oi.order_item_id) as total_qty
            FROM \`order\` o
            JOIN order_item oi ON o.order_id = oi.order_id
            JOIN menu_item m ON oi.menu_id = m.menu_id
            WHERE o.status IN ('serving') AND DATE(o.order_time) = CURDATE()
            GROUP BY m.menu_id
            ORDER BY total_qty DESC
        `);
        res.status(200).json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// reviewa dashboard
app.get('/api/cook/review/today', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT r.review_id as id, c.username as customer_name, r.rating, r.comment, r.created_at as date
            FROM review r
            JOIN payment p ON r.payment_id = p.payment_id
            JOIN \`order\` o ON p.order_id = o.order_id
            JOIN customer c ON r.customer_id = c.customer_id
            WHERE DATE(r.created_at) = CURDATE()
            ORDER BY r.created_at DESC
        `);
        res.status(200).json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 🍽️ 4. CUSTOMER SECTION (ระบบลูกค้า)
// ==========================================
app.get('/customers/tables', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT table_id, table_number FROM `table` WHERE status = "available"'
        );
        res.json(rows);
    } catch (error) {
        res.status(500).send('Server error');
    }
});
// ตรวจสอบ session ลูกค้า
app.get('/customers/session', ensureCustomerSession, async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT username, table_id, customer_id FROM customer WHERE customer_id = ? LIMIT 1',
            [req.session.customer_id]
        );
        if (rows.length === 0) return res.status(404).send('Not found');
        res.json({
            customer_id: rows[0].customer_id,
            table: rows[0].table_id,
            username: rows[0].username
        });
    } catch (error) {
        res.status(500).send('Server error');
    }
});
app.post('/customers/login', async (req, res) => {
    try {
        const { username, table_number } = req.body;

        if (!username || !table_number) {
            return res.status(400).send('Missing data');
        }

        // 🔥 เช็คโต๊ะก่อน
        const [tables] = await db.query(
            'SELECT status FROM `table` WHERE table_id = ?',
            [table_number]
        );

        if (tables.length === 0) {
            return res.status(404).send('Table not found');
        }

        if (tables[0].status === 'occupied') {
            return res.status(400).send('Table already occupied');
        }

        // สร้าง customer
        const [result] = await db.query(
            'INSERT INTO customer (username, table_id, is_paid, created_at) VALUES (?, ?, 0, NOW())',
            [username, table_number]
        );

        // mark โต๊ะ
        await db.query(
            'UPDATE `table` SET status = "occupied" WHERE table_id = ?',
            [table_number]
        );

        req.session.user_id = result.insertId; 
        req.session.username = username;
        req.session.table_id = table_number;
        req.session.role = 'customer';

        res.send('/customers/menu');

    } catch (error) {
        res.status(500).send('Server error');
    }
});

app.get('/customers/orders', ensureCustomerSession, async (req, res) => {
    try {
        const table_id = req.session.table_id;
        const customer_id = req.session.customer_id;

        const [orders] = await db.query(`
            SELECT o.order_id, m.name AS menu_name, o.status
            FROM \`order\` o
            JOIN order_item oi ON o.order_id = oi.order_id
            JOIN menu_item m ON oi.menu_id = m.menu_id
            WHERE o.table_id = ? 
              AND o.customer_id = ?
              AND o.status != 'completed'
        `, [table_id, customer_id]);

        res.json(orders);
    } catch (err) {
        res.status(500).send('Error');
    }
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

// ================= ORDER SUBMIT =================
app.post('/customers/order/submit', ensureCustomerSession, async (req, res) => {
    const customer_id = req.session.customer_id;
    const table_id = req.session.table_id;
    const { cart } = req.body;

    if (!customer_id) {
        return res.status(401).send('Not logged in');
    }

    if (!Array.isArray(cart) || cart.length === 0) {
        return res.status(400).send('Cart is empty');
    }

    let connection;

    try {
        connection = await db.getConnection();

        // 🔥 เช็ค is_paid
        const [cust] = await connection.query(
            'SELECT is_paid FROM customer WHERE customer_id = ?',
            [customer_id]
        );

        if (cust.length === 0) return res.status(404).send('Customer not found');
        if (cust[0].is_paid === 1) return res.status(400).send('Already checked out');

        await connection.beginTransaction();

        // ดึงราคาเมนูจาก DB เพื่อกันการแก้ไขราคาฝั่ง client และตรวจว่าเมนู active
        const uniqueIds = [...new Set(cart.map(item => item.id))];
        const [menus] = await connection.query(
            `SELECT menu_id, price, is_active FROM menu_item WHERE menu_id IN (?)`,
            [uniqueIds]
        );
        const menuMap = new Map(menus.map(m => [m.menu_id, m]));

        let totalPrice = 0;
        for (const item of cart) {
            const menu = menuMap.get(item.id);
            if (!menu || !menu.is_active) {
                throw new Error('Invalid or inactive menu item');
            }
            const qty = parseInt(item.qty, 10) || 0;
            if (qty <= 0) throw new Error('Invalid quantity');
            totalPrice += Number(menu.price) * qty;
        }

        const [orderResult] = await connection.query(
            "INSERT INTO `order` (customer_id, table_id, total_price, status) VALUES (?, ?, ?, 'pending')",
            [customer_id, table_id, totalPrice]
        );

        const newOrderId = orderResult.insertId;

        // insert order items ด้วยราคา server-side
        for (const item of cart) {
            const menu = menuMap.get(item.id);
            const qty = parseInt(item.qty, 10);
            for (let i = 0; i < qty; i++) {
                await connection.query(
                    "INSERT INTO order_item (order_id, menu_id, price) VALUES (?, ?, ?)",
                    [newOrderId, item.id, menu.price]
                );
            }
        }

        await connection.commit();
        res.json({ success: true, order_id: newOrderId });

    } catch (error) {
        if (connection) await connection.rollback();
        if (error.message && error.message.startsWith('Invalid')) {
            res.status(400).send(error.message);
        } else {
            res.status(500).send(error.message);
        }
    } finally {
        if (connection) connection.release();
    }
});

// ================= CHECKOUT =================
app.get('/api/checkout/:tableId', ensureCustomerSession, async (req, res) => {
    try {
        const { tableId } = req.params;
        // ป้องกันยิงต่างโต๊ะ
        if (parseInt(tableId, 10) !== parseInt(req.session.table_id, 10)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const [items] = await db.execute(`
            SELECT m.name AS menuName, m.price, COUNT(oi.order_item_id) AS amount 
            FROM order_item oi
            JOIN menu_item m ON oi.menu_id = m.menu_id
            JOIN \`order\` o ON oi.order_id = o.order_id
            WHERE o.table_id = ? AND o.status = 'serving'
              AND o.customer_id = ?
            GROUP BY m.menu_id, m.name, m.price
        `, [tableId, req.session.customer_id]);

        const totalPrice = items.reduce((sum, item) => sum + (Number(item.price) * Number(item.amount)), 0);

        res.json({ items, totalPrice });

    } catch (error) {
        console.error("Checkout error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ==========================================
// 2. ยืนยันการชำระเงิน (เพิ่มการ Insert ข้อมูลลง Payment)
// ==========================================
app.post('/api/pay', ensureCustomerSession, async (req, res) => {
    try {
        const { tableId } = req.body;
        const sessionTableId = req.session.table_id;
        if (tableId && parseInt(tableId, 10) !== parseInt(sessionTableId, 10)) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        const [orders] = await db.execute(
            'SELECT order_id, total_price FROM `order` WHERE table_id = ? AND status = ? AND customer_id = ?',
            [sessionTableId, 'serving', req.session.customer_id] 
        );

        if (orders.length === 0) {
            return res.status(400).json({ success: false, message: "ไม่มีออเดอร์" });
        }

        const orderIds = orders.map(o => o.order_id);

        // 🟢 วนลูปเพื่ออัปเดต/สร้าง payment (บันทึก total_price)
        for (const ord of orders) {
            const amount = ord.total_price || 0;
            const [payResult] = await db.execute(
                'UPDATE `payment` SET status = "completed", paid_at = NOW(), total_price = ? WHERE order_id = ?',
                [amount, ord.order_id]
            );
            if (payResult.affectedRows === 0) {
                await db.execute(
                    'INSERT INTO `payment` (order_id, status, paid_at, total_price) VALUES (?, "completed", NOW(), ?)',
                    [ord.order_id, amount]
                );
            }
        }

        // 🔥 ไม่ต้องอัปเดตสถานะ order เป็น completed (คอลัมน์รองรับแค่ pending/cooking/serving)

        // 🔥 update customer
        await db.execute(
            'UPDATE customer SET is_paid = 1 WHERE table_id = ?',
            [sessionTableId]
        );

        // 🔥 เคลียร์โต๊ะ
        await db.execute(
            'UPDATE `table` SET status = "available" WHERE table_id = ?',
            [sessionTableId]
        );

        res.json({ success: true });

    } catch (error) {
        console.error("Payment error:", error);
        res.status(500).json({ error: "Payment error", detail: error.message });
    }
});

// ==========================================
// 3. ดึงข้อมูลใบเสร็จ สำหรับหน้า history2.html 
// ==========================================
app.get('/api/receipt/:tableId', ensureCustomerSession, async (req, res) => {
    try {
        const { tableId } = req.params;
        if (parseInt(tableId, 10) !== parseInt(req.session.table_id, 10)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        // 1. หา payment ล่าสุดของโต๊ะนี้
        const [latestPayment] = await db.execute(`
            SELECT p.payment_id, p.paid_at 
            FROM \`order\` o
            JOIN \`payment\` p ON o.order_id = p.order_id
            WHERE o.table_id = ? AND p.status = 'completed' AND o.customer_id = ?
            ORDER BY p.paid_at DESC, p.payment_id DESC 
            LIMIT 1
        `, [tableId, req.session.customer_id]);

        if (latestPayment.length === 0) {
            return res.status(404).json({ message: "ไม่พบข้อมูลใบเสร็จ" });
        }

        const paidAt = latestPayment[0].paid_at;
        const paymentId = latestPayment[0].payment_id;

        // 2. ดึงรายการอาหารทั้งหมดที่จ่ายพร้อมกัน
        const [items] = await db.execute(`
            SELECT m.name AS menuName, m.price, COUNT(oi.order_item_id) AS amount 
            FROM order_item oi
            JOIN menu_item m ON oi.menu_id = m.menu_id
            JOIN \`order\` o ON oi.order_id = o.order_id
            JOIN \`payment\` p ON o.order_id = p.order_id
            WHERE o.table_id = ? AND o.customer_id = ? AND p.status = 'completed' AND p.payment_id = ?
            GROUP BY m.menu_id, m.name, m.price
        `, [tableId, req.session.customer_id, paymentId]);

        const totalPrice = items.reduce((sum, item) => sum + (Number(item.price) * Number(item.amount)), 0);

        // 🟢 3. ดึงชื่อลูกค้าจริงจากตาราง customer
        // (สมมติว่าคอลัมน์ชื่อลูกค้าในฐานข้อมูลของคุณชื่อ 'username' ถ้าเป็นชื่ออื่นเช่น 'name' ให้แก้ตรงนี้นะครับ)
        const [customer] = await db.execute(`
            SELECT username FROM customer WHERE table_id = ? LIMIT 1
        `, [tableId]);

        let realCustomerName = 'ลูกค้าทั่วไป';
        if (customer.length > 0 && customer[0].username) {
            realCustomerName = customer[0].username;
        }

        // ส่งข้อมูลทั้งหมดกลับไปให้หน้าเว็บ
        res.json({ 
            items: items, 
            totalPrice: totalPrice,
            paidAt: paidAt,
            customerName: realCustomerName // 🟢 เปลี่ยนตรงนี้ให้ใช้ตัวแปรชื่อลูกค้าจริง
        });
        res.clearCookie('connect.sid', { path: '/' });

    } catch (error) {
        console.error("Receipt Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// POST /api/review — ลูกค้าส่งรีวิวหลังชำระเงิน
app.post('/api/review', ensureCustomerSession, async (req, res) => {
    const { rating, comment } = req.body;
    const tableId = req.session.table_id;

    // ตรวจสอบข้อมูลขั้นต่ำ — ตาม spec: 400 text 'Missing rating or tableId'
    if (!tableId || !rating) {
        return res.status(400).send('Missing rating or tableId');
    }

    const ratingNum = parseInt(rating);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
        return res.status(400).send('Missing rating or tableId');
    }

    try {
        const customer_id = req.session.customer_id;

        // 2. หา payment ล่าสุดของ customer นี้ที่ status completed
        const [payments] = await db.query(
            `SELECT p.payment_id 
             FROM payment p 
             JOIN \`order\` o ON p.order_id = o.order_id 
             WHERE o.customer_id = ? AND p.status = 'completed'
             ORDER BY p.paid_at DESC, p.payment_id DESC LIMIT 1`,
            [customer_id]
        );

        if (payments.length === 0) {
            return res.status(400).send('ยังไม่มีการชำระเงิน');
        }

        const payment_id = payments[0].payment_id;

        // 3. บันทึก review ลงฐานข้อมูล
        await db.query(
            'INSERT INTO review (payment_id, customer_id, rating, comment, created_at) VALUES (?, ?, ?, ?, NOW())',
            [payment_id, customer_id, ratingNum, comment || '']
        );

        // ✅ ตาม spec: 200 JSON {"success": true}
        res.status(200).json({ success: true });

    } catch (error) {
        console.error('POST /api/review error:', error);
        // ✅ ตาม spec: 500 text 'Server error'
        res.status(500).send('Server error');
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

// --- dashboard ---
app.get('/api/admin/summary', async (req, res) => {
    const { start, end } = req.query;

    if (!start || !end) {
        return res.status(400).json({ error: "Missing start or end date parameters." });
    }

    try {
        const [nowRes] = await db.query(`SELECT COUNT(DISTINCT customer_id) as customer_now FROM \`order\` WHERE DATE(order_time) = CURDATE() AND status IN ('serving')`);
        const [custRes] = await db.query(`SELECT COUNT(DISTINCT customer_id) as total_customers FROM \`order\` WHERE order_time BETWEEN ? AND ?`, [start, end]);
        const [revRes] = await db.query(`SELECT SUM(total_price) as total_revenue FROM \`order\` WHERE order_time BETWEEN ? AND ?`, [start, end]);

        res.status(200).json({
            customer_now: nowRes[0].customer_now || 0,
            total_customers: custRes[0].total_customers || 0,
            total_revenue: revRes[0].total_revenue || 0
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/top-menus', async (req, res) => {
    const { start, end } = req.query;

    if (!start || !end) {
        return res.status(400).json({ error: "Missing start or end date parameters." });
    }

    try {
        const [rows] = await db.query(`
            SELECT m.menu_id as id, m.name, m.image_url as image, COUNT(oi.order_item_id) as total_qty
            FROM \`order\` o
            JOIN order_item oi ON o.order_id = oi.order_id
            JOIN menu_item m ON oi.menu_id = m.menu_id
            WHERE o.order_time BETWEEN ? AND ?
            GROUP BY m.menu_id
            ORDER BY total_qty DESC
        `, [start, end]);
        res.status(200).json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/reviews', async (req, res) => {
    const { start, end } = req.query;

    if (!start || !end) {
        return res.status(400).json({ error: "Missing start or end date parameters." });
    }

    try {
        const [rows] = await db.query(`
            SELECT r.review_id as id, c.username as customer_name, r.rating, r.comment, r.created_at as date
            FROM review r
            JOIN customer c ON r.customer_id = c.customer_id
            WHERE r.created_at BETWEEN ? AND ?
            ORDER BY r.created_at DESC
        `, [start, end]);
        res.status(200).json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/order/now', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT 
                m.name as menu_names,
                o.order_time as time,
                t.table_number as table_num,
                o.status
            FROM \`order\` o
            JOIN order_item oi ON o.order_id = oi.order_id
            JOIN menu_item m ON oi.menu_id = m.menu_id
            JOIN \`table\` t ON o.table_id = t.table_id
            JOIN customer c ON o.customer_id = c.customer_id
            LEFT JOIN payment p ON o.order_id = p.order_id
            WHERE c.is_paid = 0 
              AND (p.status IS NULL OR p.status != 'completed')
            ORDER BY o.order_time DESC
        `);
        res.status(200).json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/order/history', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT 
                GROUP_CONCAT(DISTINCT m.name SEPARATOR ', ') as menu_names,
                o.order_time as date,
                o.total_price as amount,
                'paid' as status
            FROM \`order\` o
            JOIN order_item oi ON o.order_id = oi.order_id
            JOIN menu_item m ON oi.menu_id = m.menu_id
            JOIN customer c ON o.customer_id = c.customer_id
            LEFT JOIN payment p ON o.order_id = p.order_id
            WHERE c.is_paid = 1 
               OR p.status = 'completed'
            GROUP BY o.order_id
            ORDER BY o.order_time DESC
        `);
        res.status(200).json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- โหลดหน้า HTML ---
//Customer
const isAuthcustomer = (req, res, next) => {
    // 1. สั่งห้ามเบราว์เซอร์เก็บ Cache หน้าจอนี้ (สำคัญมากสำหรับการก๊อปวางลิงก์)
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');

    // 2. เช็คว่ามี Session หรือไม่
    if (req.session.role == 'customer') {
        return next(); // ถ้ามี ให้ไปต่อได้
    } else {
        // 3. ถ้าไม่มี ให้ดีดกลับไปหน้า Login ทันที
        return res.redirect('/');
    }
};
app.use(express.static(path.join(__dirname, 'view')));
app.get('/customers/menu', isAuthcustomer, (req, res) => {
    res.sendFile(path.join(__dirname, 'view', 'customers', 'Menu_customers.html'));
});
app.get('/customers/cart', isAuthcustomer, (req, res) => {
    res.sendFile(path.join(__dirname, 'view', 'customers', 'capt_customers.html'));
});

app.get('/customer/OpenOrder',isAuthcustomer, (req, res) => {
    res.sendFile(path.join(__dirname, 'view', 'customers', 'check_customers.html'));
});
app.get('/customer/peyment',isAuthcustomer, (req, res) => {
    res.sendFile(path.join(__dirname, 'view', 'customers', 'PAYMENT.html'));
})
//Cook

app.get('/api/review/', (req, res) => { res.status(200).sendFile(path.join(__dirname, 'view', 'REVIEW.html')); });
// ฟังก์ชันเช็คสิทธิ์แบบละเอียด
const isAuth = (req, res, next) => {
    // 1. สั่งห้ามเบราว์เซอร์เก็บ Cache หน้าจอนี้ (สำคัญมากสำหรับการก๊อปวางลิงก์)
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');

    // 2. เช็คว่ามี Session หรือไม่
    if (req.session.role == 'cook') {
        return next(); // ถ้ามี ให้ไปต่อได้
    } else {
        // 3. ถ้าไม่มี ให้ดีดกลับไปหน้า Login ทันที
        return res.redirect('/');
    }
};
// ใช้ isAdmin เข้ามาคั่นกลางก่อนจะส่งไฟล์
app.get('/cook/dashboard', isAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'view', 'cooks', 'Dashdoard_cook.html'));
});

app.get('/cook/orderoper', isAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'view', 'cooks', 'Order_cook.html'));
});
app.get('/', (req, res) => {
    if (req.session.role === 'admin') {
        return res.redirect('/admin/dashboard');
    } else if (req.session.role === 'cook') {
        return res.redirect('/cook/dashboard');
    } else if (req.session.role === 'customer') {
        return res.redirect('/customers/menu');
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
//Admin
const isAuthadmin = (req, res, next) => {
    // 1. สั่งห้ามเบราว์เซอร์เก็บ Cache หน้าจอนี้ (สำคัญมากสำหรับการก๊อปวางลิงก์)
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');

    // 2. เช็คว่ามี Session หรือไม่
    if (req.session.role == 'admin') {
        return next(); // ถ้ามี ให้ไปต่อได้
    } else {
        // 3. ถ้าไม่มี ให้ดีดกลับไปหน้า Login ทันที
        return res.redirect('/');
    }
};
app.get('/admin/cooks', isAuthadmin, (req, res) => res.sendFile(path.join(__dirname, 'view', 'admin', 'Menu_admin.html')));
app.get('/admin/menu', isAuthadmin, (req, res) => res.sendFile(path.join(__dirname, 'view', 'admin', 'lisCook_admin.html')));
app.get('/admin/dashboard', isAuthadmin, (req, res) => { res.status(200).sendFile(path.join(__dirname, 'view', 'admin', 'Dashdoard_admin.html')); });
app.get('/admin/order/now', isAuthadmin, (req, res) => { res.status(200).sendFile(path.join(__dirname, 'view', 'admin', 'OrderNow_admin.html')); });
app.get('/admin/order/history', isAuthadmin, (req, res) => { res.status(200).sendFile(path.join(__dirname, 'view', 'admin', 'OrderHistory_admin.html')); });

//start server
app.listen(3000, () => console.log('🚀 Server running on http://localhost:3000'));
