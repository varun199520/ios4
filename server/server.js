import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 8080;
const JWT_SECRET = 'your-secret-key-change-in-production';

// Middleware
app.use(cors());
app.use(express.json());

// Initialize SQLite database
const db = new sqlite3.Database(join(__dirname, 'database.sqlite'));

// Initialize database tables
db.serialize(() => {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Asset tags table
  db.run(`CREATE TABLE IF NOT EXISTS asset_tags (
    tag TEXT PRIMARY KEY,
    status TEXT DEFAULT 'unused',
    last_serial TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Pairs table
  db.run(`CREATE TABLE IF NOT EXISTS pairs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_tag TEXT NOT NULL,
    serial TEXT NOT NULL,
    assigned_by TEXT NOT NULL,
    assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(asset_tag, serial)
  )`);

  // Create default user: admin/password123
  const hashedPassword = bcrypt.hashSync('password123', 10);
  db.run(`INSERT OR IGNORE INTO users (username, password) VALUES (?, ?)`, 
    ['admin', hashedPassword]);

  // Add some sample asset tags
  const sampleTags = ['AT001', 'AT002', 'AT003', 'AT004', 'AT005'];
  sampleTags.forEach(tag => {
    db.run(`INSERT OR IGNORE INTO asset_tags (tag) VALUES (?)`, [tag]);
  });
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Routes

// API root - simple health/info
app.get('/api', (req, res) => {
  res.json({ message: 'Asset Tracker API', version: '1.0.0' });
});

// Login endpoint
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      username: user.username,
      expires_in: 86400 // 24 hours in seconds
    });
  });
});

// Get asset tags
app.get('/api/asset-tags', authenticateToken, (req, res) => {
  const { since } = req.query;
  let query = 'SELECT * FROM asset_tags';
  const params = [];

  if (since) {
    query += ' WHERE updated_at > ?';
    params.push(since);
  }

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    const assetTags = rows.map(row => ({
      tag: row.tag,
      status: row.status,
      last_serial: row.last_serial,
      updated_at: row.updated_at
    }));

    res.json(assetTags);
  });
});

// Upload pairs (batch)
app.post('/api/pairs/batch', authenticateToken, (req, res) => {
  const pairs = req.body;
  const results = [];

  if (!Array.isArray(pairs)) {
    return res.status(400).json({ error: 'Expected array of pairs' });
  }

  let completed = 0;

  pairs.forEach((pair, index) => {
    const { asset_tag, serial, scanned_at } = pair;

    // Check if asset tag exists
    db.get('SELECT * FROM asset_tags WHERE tag = ?', [asset_tag], (err, assetTag) => {
      if (err) {
        results[index] = {
          status: 'error',
          asset_tag,
          serial,
          message: 'Database error'
        };
        completed++;
        if (completed === pairs.length) {
          res.json(results);
        }
        return;
      }

      if (!assetTag) {
        results[index] = {
          status: 'missing_asset_tag',
          asset_tag,
          serial,
          message: 'Asset tag not found'
        };
        completed++;
        if (completed === pairs.length) {
          res.json(results);
        }
        return;
      }

      // Check if pair already exists
      db.get('SELECT * FROM pairs WHERE asset_tag = ? AND serial = ?', 
        [asset_tag, serial], (err, existingPair) => {
        if (err) {
          results[index] = {
            status: 'error',
            asset_tag,
            serial,
            message: 'Database error'
          };
          completed++;
          if (completed === pairs.length) {
            res.json(results);
          }
          return;
        }

        const status = existingPair ? 'ok_overwrite_same_pair' : 'ok_inserted';

        // Insert or update pair
        db.run(`INSERT OR REPLACE INTO pairs (asset_tag, serial, assigned_by, assigned_at) 
                VALUES (?, ?, ?, ?)`, 
          [asset_tag, serial, req.user.username, scanned_at || new Date().toISOString()], 
          (err) => {
            if (err) {
              results[index] = {
                status: 'error',
                asset_tag,
                serial,
                message: 'Failed to save pair'
              };
            } else {
              // Update asset tag status
              db.run('UPDATE asset_tags SET status = ?, last_serial = ?, updated_at = CURRENT_TIMESTAMP WHERE tag = ?',
                ['used', serial, asset_tag]);

              results[index] = {
                status,
                asset_tag,
                serial
              };
            }

            completed++;
            if (completed === pairs.length) {
              res.json(results);
            }
          });
      });
    });
  });
});

// Search pairs
app.get('/api/pairs/search', authenticateToken, (req, res) => {
  const { asset_tag, serial } = req.query;

  if (!asset_tag && !serial) {
    return res.status(400).json({ error: 'Either asset_tag or serial required' });
  }

  let query = `
    SELECT p.*, at.status as tag_status 
    FROM pairs p 
    LEFT JOIN asset_tags at ON p.asset_tag = at.tag 
    WHERE 1=1
  `;
  const params = [];

  if (asset_tag) {
    query += ' AND p.asset_tag = ?';
    params.push(asset_tag);
  }

  if (serial) {
    query += ' AND p.serial = ?';
    params.push(serial);
  }

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (rows.length === 0) {
      return res.status(404).json({ error: 'No pairs found' });
    }

    const result = {
      asset_tag: rows[0].asset_tag,
      serial: rows[0].serial,
      status: rows[0].tag_status || 'unused',
      history: rows.map(row => ({
        serial: row.serial,
        assigned_at: row.assigned_at,
        assigned_by: row.assigned_by
      }))
    };

    res.json(result);
  });
});

// Replace pair
app.put('/api/pairs/replace', authenticateToken, (req, res) => {
  const { searchBy, value, new_asset_tag, new_serial } = req.body;

  if (!searchBy || !value || (!new_asset_tag && !new_serial)) {
    return res.status(400).json({ 
      success: false, 
      message: 'Missing required parameters' 
    });
  }

  // Find existing pair
  let searchQuery = '';
  if (searchBy === 'asset_tag') {
    searchQuery = 'SELECT * FROM pairs WHERE asset_tag = ? ORDER BY assigned_at DESC LIMIT 1';
  } else {
    searchQuery = 'SELECT * FROM pairs WHERE serial = ? ORDER BY assigned_at DESC LIMIT 1';
  }

  db.get(searchQuery, [value], (err, existingPair) => {
    if (err) {
      return res.status(500).json({ 
        success: false, 
        message: 'Database error' 
      });
    }

    if (!existingPair) {
      return res.status(404).json({ 
        success: false, 
        message: 'No matching pair found' 
      });
    }

    // Update the pair with new values
    const updateAssetTag = new_asset_tag || existingPair.asset_tag;
    const updateSerial = new_serial || existingPair.serial;

    // Insert new pair record (keeping history)
    db.run(`INSERT INTO pairs (asset_tag, serial, assigned_by, assigned_at) 
            VALUES (?, ?, ?, ?)`, 
      [updateAssetTag, updateSerial, req.user.username, new Date().toISOString()], 
      function(err) {
        if (err) {
          return res.status(500).json({ 
            success: false, 
            message: 'Failed to create replacement pair' 
          });
        }

        // Update asset tag status
        db.run('UPDATE asset_tags SET status = ?, last_serial = ?, updated_at = CURRENT_TIMESTAMP WHERE tag = ?',
          ['used', updateSerial, updateAssetTag], (err) => {
            if (err) {
              console.error('Failed to update asset tag:', err);
            }
          });

        res.json({ 
          success: true, 
          message: `Successfully replaced ${searchBy} ${value} with new serial ${updateSerial}` 
        });
      });
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Asset Tracker Server running on http://localhost:${PORT}`);
  console.log(`📊 API Base URL: http://localhost:${PORT}/api`);
  console.log(`👤 Default Login Credentials:`);
  console.log(`   Username: admin`);
  console.log(`   Password: password123`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err);
    } else {
      console.log('Database connection closed.');
    }
    process.exit(0);
  });
});
