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
// =========================================================
// 🗄️ 1. DATABASE CONNECTION
// =========================================================
const db = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'database_webdev_course',
    port: 3306, //3306 is default MySQL port
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
        res.status(200).send('/public/admin/Dashdoard_admin.html');
    } catch (error) {
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
app.post('/customers/login', async (req, res) => {
    try {
        const { username, table_number } = req.body;

        if (!username || !table_number) {
            return res.status(400).send('Missing data');
        }

        // สร้าง customer
        const [result] = await db.query(
            'INSERT INTO customer (username, table_id, is_paid, created_at) VALUES (?, ?, 0, NOW())',
            [username, table_number]
        );

        // mark โต๊ะ = occupied 🔥
        await db.query(
            'UPDATE `table` SET status = "occupied" WHERE table_id = ?',
            [table_number]
        );

        // session
        req.session.customer_id = result.insertId;
        req.session.username = username;
        req.session.table_id = table_number;

        res.send('/customers/menu');

    } catch (error) {
        res.status(500).send('Server error');
    }
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
              AND o.status != 'completed' -- 👈 แนะนำให้เพิ่มบรรทัดนี้ เพื่อไม่โชว์ออเดอร์เก่าที่ทำเสร็จจบไปแล้ว
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

// ================= ORDER SUBMIT =================
app.post('/customers/order/submit', async (req, res) => {
    const customer_id = req.session.customer_id;
    const table_id = req.session.table_id;
    const { cart, total } = req.body;

    if (!customer_id) {
        return res.status(401).send('Not logged in');
    }

    let connection;

    try {
        connection = await db.getConnection();

        // 🔥 CHECK is_paid ก่อนทำอะไรทั้งหมด
        const [cust] = await connection.query(
            'SELECT is_paid FROM customer WHERE customer_id = ?',
            [customer_id]
        );

        if (cust.length === 0) {
            return res.status(404).send('Customer not found');
        }

        if (cust[0].is_paid === 1) {
            return res.status(400).send('Already checked out');
        }

        // ✅ เริ่ม transaction
        await connection.beginTransaction();

        // สร้าง order
        const [orderResult] = await connection.query(
            "INSERT INTO `order` (customer_id, table_id, total_price, status) VALUES (?, ?, ?, 'pending')",
            [customer_id, table_id, total]
        );

        const newOrderId = orderResult.insertId;

        // เพิ่ม order_item (แก้ bug แล้ว ❌ ไม่มี customer_id)
        for (const item of cart) {
            for (let i = 0; i < item.qty; i++) {
                await connection.query(
                    "INSERT INTO order_item (order_id, menu_id, price) VALUES (?, ?, ?)",
                    [newOrderId, item.id, item.price]
                );
            }
        }

        await connection.commit();

        res.status(200).json({
            success: true,
            order_id: newOrderId
        });

    } catch (error) {
        if (connection) await connection.rollback();
        res.status(500).send('Error: ' + error.message);
    } finally {
        if (connection) connection.release();
    }
});

// ================= CHECKOUT =================
app.post('/customers/checkout', async (req, res) => {
    try {
        const customer_id = req.session.customer_id;
        const table_id = req.session.table_id;

        if (!customer_id) {
            return res.status(401).send('Not logged in');
        }

        // 🔥 mark ว่าจ่ายเงินแล้ว
        await db.query(
            'UPDATE customer SET is_paid = 1 WHERE customer_id = ?',
            [customer_id]
        );

        // 🔥 ปิด order ทั้งหมด
        await db.query(
            'UPDATE `order` SET status = "completed" WHERE customer_id = ?',
            [customer_id]
        );

        // 🔥 เคลียร์โต๊ะ
        await db.query(
            'UPDATE `table` SET status = "available" WHERE table_id = ?',
            [table_id]
        );

        // 🔥 ลบ session
        req.session.destroy((err) => {
            if (err) return res.status(500).send('Logout error');

            res.clearCookie('connect.sid');
            res.status(200).send('Checkout success');
        });

    } catch (error) {
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
app.use(express.static(path.join(__dirname, 'view')));
app.get('/customers/menu', isCustomerAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'view', 'customers', 'Menu_customers.html'));
});
app.get('/customers/cart', isCustomerAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'view', 'customers', 'cart_customers.html'));
});
// ฟังก์ชันเช็คสิทธิ์แบบละเอียด
const isAuth = (req, res, next) => {
    // 1. สั่งห้ามเบราว์เซอร์เก็บ Cache หน้าจอนี้ (สำคัญมากสำหรับการก๊อปวางลิงก์)
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');

    // 2. เช็คว่ามี Session หรือไม่
    if (req.session.user_id) {
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
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/admin/cooks', isAuth, (req, res) => res.sendFile(path.join(__dirname, 'view', 'admin', 'Menu_admin.html')));
app.get('/admin/menu', isAuth, (req, res) => res.sendFile(path.join(__dirname, 'view', 'admin', 'lisCook_admin.html')));
app.get('/admin/dashboard', isAuth, (req, res) => { res.status(200).sendFile(path.join(__dirname, 'view', 'admin', 'Dashdoard_admin.html')); });
app.get('/admin/order/now', isAuth, (req, res) => { res.status(200).sendFile(path.join(__dirname, 'view', 'admin', 'OrderNow_admin.html')); });
app.get('/admin/order/history', isAuth, (req, res) => { res.status(200).sendFile(path.join(__dirname, 'view', 'admin', 'OrderHistory_admin.html')); });

//start server
app.listen(3000, () => console.log('🚀 Server running on http://localhost:3000'));
