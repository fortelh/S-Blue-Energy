const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const multer = require('multer');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');

const app = express();
const db = new sqlite3.Database('./database.db');

// --- 1. SYSTEM CONFIGURATION & MIDDLEWARE ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'sblue_enterprise_secret_2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000, path: '/', httpOnly: true }
}));

// --- 2. STORAGE ENGINE (MULTIPLE UPLOADS) ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './public/uploads';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});
const upload = multer({ storage: storage });

// --- 3. SECURITY SHIELDS ---
const checkAuth = (req, res, next) => {
    if (req.session.userId) return next();
    res.status(401).redirect('/login.html');
};

const authorize = (roles) => (req, res, next) => {
    if (roles.includes(req.session.role)) return next();
    res.status(403).send("Access Denied: Insufficient Clearance.");
};

// --- 4. DATABASE ARCHITECTURE ---
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, password TEXT, role TEXT, account_number TEXT UNIQUE, name TEXT, address TEXT, phone TEXT, email TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS services (id INTEGER PRIMARY KEY, title TEXT, description TEXT, content TEXT, image_url TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY, title TEXT, location TEXT, content TEXT, image_url TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY, key TEXT UNIQUE, value TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY, title TEXT, message TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`);

    // Default Settings Initialization
    const defaults = [
        ['logo', '/uploads/default-logo.png'],
        ['dossier_text', 'Engineering Next-Generation Industrial Infrastructure Models.'],
        ['about_text', 'S-Blue Energy global operational portfolio narrative metrics.'],
        ['smtp_host', 'smtp.gmail.com'], ['smtp_port', '587'], ['smtp_user', ''], ['smtp_pass', '']
    ];
    defaults.forEach(pair => db.run("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", pair));
});

// --- 5. AUTHENTICATION NODES ---
app.post('/auth/login', (req, res) => {
    const { username, password } = req.body;
    
    // Check for hardcoded Owner fallback or DB user
db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
    if (user && await bcrypt.compare(password, user.password)) {
        req.session.userId = user.id;
        req.session.role = user.role;
        // This is where the name comes from the database and enters the session
        req.session.fullname = user.name; 
        
        return res.redirect(user.role === 'User' ? '/profile.html' : '/admin.html');
    }
    
    // Fallback for initial 'Owner' setup
    if (username === 'Owner' && password === 'password123') {
        req.session.userId = 999; 
        req.session.role = 'Owner';
        req.session.fullname = 'S-Blue Admin'; // Default name for fallback account
        return res.redirect('/admin.html');
    }
    res.status(401).send("Invalid Signature. <a href='/login.html'>Retry</a>");
});
});

app.post('/api/admin/update-text', (req, res) => {
    // Only allow Owners/Managers
    if (req.session.role !== 'Owner' && req.session.role !== 'Manager') return res.sendStatus(403);

    const { key, value } = req.body; 
    // Key will be 'about_text' or 'dossier_text'
    
    db.run(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [key, value], (err) => {
        if (err) return res.status(500).send("Database Error");
        res.sendStatus(200);
    });
});
app.post('/auth/signup', async (req, res) => {
    const { username, password, name, email, phone, address } = req.body;
    try {
        const hash = await bcrypt.hash(password, 10);
        const acc = 'SBLU-' + Math.floor(100000 + Math.random() * 900000);
        db.run(`INSERT INTO users (username, password, role, account_number, name, address, phone, email) VALUES (?,?,'User',?,?,?,?,?)`,
            [username, hash, acc, name, address, phone, email], (err) => {
                if (err) return res.status(400).send("Registration Error: User already exists.");
                res.send("Success! <a href='/login.html'>Login</a>");
            });
    } catch (e) { res.sendStatus(500); }
});

app.get('/auth/status', (req, res) => {
    if (!req.session.userId) return res.json({ loggedIn: false });

    res.json({ 
        loggedIn: true, 
        role: req.session.role, 
        userId: req.session.userId,
        // Match the HTML key 'auth.name'
        name: req.session.fullname 
    });
});
app.get('/auth/logout', (req, res) => req.session.destroy(() => res.redirect('/')));

// --- 6. ADMINISTRATIVE CONTROL APIS ---

// Settings Management
app.get('/api/settings/all', (req, res) => {
    db.all("SELECT key, value FROM settings", (err, rows) => {
        if (err) return res.status(500).json({});
        
        // Convert array [ {key: 'about', value: '...'} ] 
        // to object { about: '...' } so the Admin JS can read it
        const settingsMap = {};
        if (rows) {
            rows.forEach(row => {
                settingsMap[row.key] = row.value;
            });
        }
        res.json(settingsMap);
    });
});
app.post('/admin/update-settings', (req, res) => {
    if (req.session.role !== 'Owner' && req.session.role !== 'Manager') return res.sendStatus(403);
    const { key, value } = req.body;
    
    db.run(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [key, value], (err) => {
        if (err) return res.status(500).send(err);
        res.sendStatus(200);
    });
});
app.post('/admin/update-logo', checkAuth, authorize(['Owner']), upload.single('logo'), (req, res) => {
    if (!req.file) return res.redirect('/admin.html');
    const path = `/uploads/${req.file.filename}`;
    db.run("UPDATE settings SET value = ? WHERE key = 'logo'", [path], () => res.redirect('/admin.html'));
});

// User Management
app.get('/api/users/customers', checkAuth, (req, res) => db.all("SELECT * FROM users WHERE role='User'", (err, r) => res.json(r)));
app.get('/api/users/staff', checkAuth, (req, res) => db.all("SELECT * FROM users WHERE role!='User'", (err, r) => res.json(r)));

app.post('/admin/users/update', checkAuth, async (req, res) => {
    const { id, name, email, phone, address, new_password } = req.body;
    if (new_password) {
        const hash = await bcrypt.hash(new_password, 10);
        db.run("UPDATE users SET name=?, email=?, phone=?, address=?, password=? WHERE id=?", [name, email, phone, address, hash, id], () => res.sendStatus(200));
    } else {
        db.run("UPDATE users SET name=?, email=?, phone=?, address=? WHERE id=?", [name, email, phone, address, id], () => res.sendStatus(200));
    }
});

// Dedicated route for users to update their own profile
app.post('/api/user/update-profile', async (req, res) => {
    if (!req.session.userId) return res.sendStatus(401);

    const { name, email, phone, address, new_password } = req.body;
    const userId = req.session.userId; // Securely get ID from session

    try {
        if (new_password && new_password.trim() !== "") {
            const hash = await bcrypt.hash(new_password, 10);
            db.run(
                "UPDATE users SET name=?, email=?, phone=?, address=?, password=? WHERE id=?",
                [name, email, phone, address, hash, userId],
                (err) => {
                    if (err) return res.status(500).send(err);
                    req.session.fullname = name; // Update session name immediately
                    res.sendStatus(200);
                }
            );
        } else {
            db.run(
                "UPDATE users SET name=?, email=?, phone=?, address=? WHERE id=?",
                [name, email, phone, address, userId],
                (err) => {
                    if (err) return res.status(500).send(err);
                    req.session.fullname = name; // Update session name immediately
                    res.sendStatus(200);
                }
            );
        }
    } catch (error) {
        res.status(500).send("Security Hashing Error");
    }
});

app.post('/admin/users/delete', checkAuth, authorize(['Owner']), (req, res) => {
    db.run("DELETE FROM users WHERE id = ? AND role != 'Owner'", [req.body.id], () => res.sendStatus(200));
});

// --- 7. CONTENT ENGINE (SERVICES & PROJECTS) ---

// READ
app.get('/api/services', (req, res) => db.all("SELECT * FROM services", (err, r) => res.json(r || [])));
app.get('/api/projects', (req, res) => db.all("SELECT * FROM projects", (err, r) => res.json(r || [])));

// CREATE
app.post('/admin/services/create', checkAuth, upload.single('image'), (req, res) => {
    const img = req.file ? `/uploads/${req.file.filename}` : '';
    db.run("INSERT INTO services (title, description, content, image_url) VALUES (?,?,?,?)", 
        [req.body.title, req.body.description, req.body.content, img], () => res.redirect('/admin.html'));
});

app.post('/admin/projects/create', checkAuth, upload.single('image'), (req, res) => {
    const img = req.file ? `/uploads/${req.file.filename}` : '';
    db.run("INSERT INTO projects (title, location, content, image_url) VALUES (?,?,?,?)", 
        [req.body.title, req.body.location, req.body.content || '', img], () => res.redirect('/admin.html'));
});

// DELETE (Required for your Admin Panel updates)
app.post('/admin/services/delete', checkAuth, authorize(['Owner', 'Manager']), (req, res) => {
    db.run("DELETE FROM services WHERE id = ?", [req.body.id], () => res.sendStatus(200));
});

app.post('/admin/projects/delete', checkAuth, authorize(['Owner', 'Manager']), (req, res) => {
    db.run("DELETE FROM projects WHERE id = ?", [req.body.id], () => res.sendStatus(200));
});
// --- Update Core Services ---
app.post('/admin/services/update', (req, res) => {
    console.log("Received Payload:", req.body); 

    if (!req.body || !req.body.id) {
        return res.status(400).send("Payload invalid: 'id' is missing.");
    }

    const { id, title, description, icon } = req.body;

    const query = "UPDATE services SET title = ?, description = ?, icon = ? WHERE id = ?";
    db.run(query, [title, description, icon, id], function(err) {
        if (err) {
            console.error("Service Update Error:", err);
            return res.status(500).send("Database Error");
        }
        res.sendStatus(200);
    });
});

// --- Update Site Projects ---
app.post('/admin/projects/update', (req, res) => {
  console.log("Received Payload:", req.body);
    if (req.session.role !== 'Owner' && req.session.role !== 'Manager') {
        return res.status(403).send("Unauthorized Access");
    }

    const { id, name, status, location, progress } = req.body;

    const query = "UPDATE projects SET name = ?, status = ?, location = ?, progress = ? WHERE id = ?";
    db.run(query, [name, status, location, progress, id], function(err) {
        if (err) {
            console.error("Project Update Error:", err);
            return res.status(500).send("Database Error");
        }
        res.sendStatus(200);
    });
});
// --- 8. PUBLIC CONTENT FETCH ---
app.get('/api/settings/:key', (req, res) => {
    const query = "SELECT value FROM settings WHERE key = ?";
    db.get(query, [req.params.key], (err, row) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ value: "Error retrieving data." });
        }
        // If the row exists, send the value; otherwise send an empty string
        res.json({ value: row ? row.value : "" });
    });
});
// --- 9. PROFILE & SYSTEM START ---
app.get('/api/profile/me', checkAuth, (req, res) => {
    db.get("SELECT * FROM users WHERE id = ?", [req.session.userId], (err, user) => res.json(user));
});

// Static Files & Landing
app.get('/admin.html', checkAuth, authorize(['Owner', 'Manager']), (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.use(express.static(path.join(__dirname, 'public')));

app.listen(3000, () => console.log("S-Blue Enterprise Core: http://localhost:3000"));