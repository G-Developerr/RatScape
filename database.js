const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// ΣΗΜΑΝΤΙΚΟ: Χρησιμοποιούμε απόλυτο path
const dbPath = path.join(process.cwd(), "chat.db");
console.log("📁 Database path:", dbPath);

// Δημιουργία persistent database
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("❌ Error opening database:", err);
  } else {
    console.log("✅ Database connected successfully");
  }
});

// Initialize database tables
db.serialize(() => {
  // Users table - FIXED VERSION
  db.run(
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      status TEXT DEFAULT 'Online',
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    (err) => {
      if (err) {
        console.error("❌ Error creating users table:", err);
      } else {
        console.log("✅ Users table ready");
      }
    }
  );

  // Sessions table - NEW TABLE FOR PERSISTENT SESSIONS
  db.run(
    `CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
    )`,
    (err) => {
      if (err) {
        console.error("❌ Error creating sessions table:", err);
      } else {
        console.log("✅ Sessions table ready");
      }
    }
  );

  // Rooms table
  db.run(
    `CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      invite_code TEXT UNIQUE NOT NULL
    )`,
    (err) => {
      if (err) {
        console.error("❌ Error creating rooms table:", err);
      } else {
        console.log("✅ Rooms table ready");
      }
    }
  );

  // Room Members table
  db.run(
    `CREATE TABLE IF NOT EXISTS room_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      username TEXT NOT NULL,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(room_id, username)
    )`,
    (err) => {
      if (err) {
        console.error("❌ Error creating room_members table:", err);
      } else {
        console.log("✅ Room members table ready");
      }
    }
  );

  // Messages table
  db.run(
    `CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      sender TEXT NOT NULL,
      room_id TEXT NOT NULL,
      time DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    (err) => {
      if (err) {
        console.error("❌ Error creating messages table:", err);
      } else {
        console.log("✅ Messages table ready");
      }
    }
  );

  // Private messages table
  db.run(
    `CREATE TABLE IF NOT EXISTS private_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      sender TEXT NOT NULL,
      receiver TEXT NOT NULL,
      time DATETIME DEFAULT CURRENT_TIMESTAMP,
      read BOOLEAN DEFAULT FALSE
    )`,
    (err) => {
      if (err) {
        console.error("❌ Error creating private_messages table:", err);
      } else {
        console.log("✅ Private messages table ready");
      }
    }
  );

  // Friends table
  db.run(
    `CREATE TABLE IF NOT EXISTS friends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user1 TEXT NOT NULL,
      user2 TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      responded_at DATETIME,
      UNIQUE(user1, user2)
    )`,
    (err) => {
      if (err) {
        console.error("❌ Error creating friends table:", err);
      } else {
        console.log("✅ Friends table ready");
      }
    }
  );

  // Verify tables were created
  db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
    if (err) {
      console.error("❌ Error checking tables:", err);
    } else {
      console.log(
        "📊 Database tables:",
        tables.map((t) => t.name)
      );
    }
  });
});

// Generate random invite code
function generateInviteCode() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

export const dbHelpers = {
  // Session methods - NEW METHODS FOR PERSISTENT SESSIONS
  saveSession: (sessionId, sessionData) => {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT OR REPLACE INTO sessions (session_id, username, created_at, last_accessed) 
         VALUES (?, ?, ?, datetime('now'))`,
        [sessionId, sessionData.username, sessionData.createdAt],
        (err) => {
          if (err) {
            console.error("❌ Error saving session:", err);
            reject(err);
          } else {
            console.log(`✅ Session saved for user: ${sessionData.username}`);
            resolve();
          }
        }
      );
    });
  },

  getSession: (sessionId) => {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT session_id, username, created_at, last_accessed 
         FROM sessions WHERE session_id = ?`,
        [sessionId],
        (err, row) => {
          if (err) {
            console.error("❌ Error getting session:", err);
            reject(err);
          } else {
            if (row) {
              resolve({
                username: row.username,
                createdAt: new Date(row.created_at).getTime(),
                last_accessed: new Date(row.last_accessed).getTime()
              });
            } else {
              resolve(null);
            }
          }
        }
      );
    });
  },

  updateSessionAccess: (sessionId) => {
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE sessions SET last_accessed = datetime('now') WHERE session_id = ?`,
        [sessionId],
        (err) => {
          if (err) {
            console.error("❌ Error updating session access:", err);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  },

  deleteSession: (sessionId) => {
    return new Promise((resolve, reject) => {
      db.run(`DELETE FROM sessions WHERE session_id = ?`, [sessionId], (err) => {
        if (err) {
          console.error("❌ Error deleting session:", err);
          reject(err);
        } else {
          console.log(`✅ Session deleted: ${sessionId}`);
          resolve();
        }
      });
    });
  },

  cleanupExpiredSessions: () => {
    return new Promise((resolve, reject) => {
      // Delete sessions older than 7 days
      db.run(
        `DELETE FROM sessions WHERE last_accessed < datetime('now', '-7 days')`,
        (err) => {
          if (err) {
            console.error("❌ Error cleaning expired sessions:", err);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  },

  // User methods
  createUser: (email, username, password) => {
    return new Promise((resolve, reject) => {
      console.log(`📝 Creating user: ${email}, ${username}`);

      db.run(
        `INSERT INTO users (email, username, password) VALUES (?, ?, ?)`,
        [email, username, password],
        function (err) {
          if (err) {
            console.error("❌ Error creating user:", err);
            reject(err);
          } else {
            console.log(`✅ User created successfully - ID: ${this.lastID}`);
            resolve();
          }
        }
      );
    });
  },

  findUserByEmail: (email) => {
    return new Promise((resolve, reject) => {
      db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, row) => {
        if (err) {
          console.error("❌ Error in findUserByEmail:", err);
          reject(err);
        } else {
          if (row) {
            console.log(`✅ Found user by email: ${email}`);
          } else {
            console.log(`❌ User not found by email: ${email}`);
          }
          resolve(row);
        }
      });
    });
  },

  findUserByUsername: (username) => {
    return new Promise((resolve, reject) => {
      db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, row) => {
        if (err) {
          console.error("❌ Error in findUserByUsername:", err);
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  },

  // FIXED: saveUser now uses UPDATE instead of INSERT OR REPLACE
  saveUser: (user) => {
    return new Promise((resolve, reject) => {
      // Χρησιμοποιούμε UPDATE αντί για INSERT OR REPLACE για να αποφύγουμε το NOT NULL constraint
      db.run(
        `UPDATE users SET status = ?, last_seen = datetime('now') WHERE username = ?`,
        [user.status, user.username],
        function (err) {
          if (err) {
            console.error("❌ Error in saveUser:", err);
            reject(err);
          } else {
            // Αν δεν βρεθεί χρήστης, τότε αγνοούμε το error (δεν είναι κρίσιμο)
            if (this.changes === 0) {
              console.log(`⚠️ User not found for status update: ${user.username}`);
            } else {
              console.log(`✅ User status updated: ${user.username}`);
            }
            resolve();
          }
        }
      );
    });
  },

  getAllUsers: () => {
    return new Promise((resolve, reject) => {
      db.all(`SELECT * FROM users`, (err, rows) => {
        if (err) {
          console.error("❌ Error getting all users:", err);
          reject(err);
        } else {
          console.log(`📊 Total users in database: ${rows.length}`);
          resolve(rows || []);
        }
      });
    });
  },

  // Room methods
  createRoom: (name, createdBy) => {
    return new Promise((resolve, reject) => {
      const roomId = `room_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const inviteCode = generateInviteCode();

      db.run(
        `INSERT INTO rooms (id, name, created_by, invite_code) VALUES (?, ?, ?, ?)`,
        [roomId, name, createdBy, inviteCode],
        function (err) {
          if (err) {
            console.error("❌ Error in createRoom:", err);
            reject(err);
          } else {
            resolve({ roomId, inviteCode });
          }
        }
      );
    });
  },

  getRoomByInviteCode: (inviteCode) => {
    return new Promise((resolve, reject) => {
      db.get(`SELECT * FROM rooms WHERE invite_code = ?`, [inviteCode], (err, row) => {
        if (err) {
          console.error("❌ Error in getRoomByInviteCode:", err);
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  },

  getRoomById: (roomId) => {
    return new Promise((resolve, reject) => {
      db.get(`SELECT * FROM rooms WHERE id = ?`, [roomId], (err, row) => {
        if (err) {
          console.error("❌ Error in getRoomById:", err);
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  },

  getUserRooms: (username) => {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT r.* FROM rooms r
         INNER JOIN room_members rm ON r.id = rm.room_id
         WHERE rm.username = ?
         ORDER BY r.created_at DESC`,
        [username],
        (err, rows) => {
          if (err) {
            console.error("❌ Error in getUserRooms:", err);
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
  },

  // Room membership methods
  addUserToRoom: (roomId, username) => {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT OR IGNORE INTO room_members (room_id, username) VALUES (?, ?)`,
        [roomId, username],
        (err) => {
          if (err) {
            console.error("❌ Error in addUserToRoom:", err);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  },

  isUserInRoom: (roomId, username) => {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT 1 FROM room_members WHERE room_id = ? AND username = ?`,
        [roomId, username],
        (err, row) => {
          if (err) {
            console.error("❌ Error in isUserInRoom:", err);
            reject(err);
          } else {
            resolve(!!row);
          }
        }
      );
    });
  },

  getRoomMembers: (roomId) => {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT username, joined_at FROM room_members WHERE room_id = ? ORDER BY joined_at`,
        [roomId],
        (err, rows) => {
          if (err) {
            console.error("❌ Error in getRoomMembers:", err);
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
  },

  // Message methods
  saveMessage: (message) => {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO messages (text, sender, room_id, time) VALUES (?, ?, ?, ?)`,
        [message.text, message.sender, message.room_id, message.time],
        (err) => {
          if (err) {
            console.error("❌ Error in saveMessage:", err);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  },

  getRoomMessages: (roomId, sinceTime) => {
    return new Promise((resolve, reject) => {
      let query = `SELECT * FROM messages WHERE room_id = ?`;
      let params = [roomId];

      if (sinceTime) {
        query += ` AND time > ?`;
        params.push(sinceTime);
      }

      query += ` ORDER BY time ASC LIMIT 100`;

      db.all(query, params, (err, rows) => {
        if (err) {
          console.error("❌ Error in getRoomMessages:", err);
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  },

  clearRoomMessages: (roomId) => {
    return new Promise((resolve, reject) => {
      db.run(`DELETE FROM messages WHERE room_id = ?`, [roomId], (err) => {
        if (err) {
          console.error("❌ Error in clearRoomMessages:", err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  },

  // Private message methods
  savePrivateMessage: (message) => {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO private_messages (text, sender, receiver, time) VALUES (?, ?, ?, ?)`,
        [message.text, message.sender, message.receiver, message.time],
        (err) => {
          if (err) {
            console.error("❌ Error in savePrivateMessage:", err);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  },

  getPrivateMessages: (user1, user2) => {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM private_messages 
         WHERE (sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?) 
         ORDER BY time ASC`,
        [user1, user2, user2, user1],
        (err, rows) => {
          if (err) {
            console.error("❌ Error in getPrivateMessages:", err);
            reject(err);
          } else {
            resolve(rows || []);
          }
        }
      );
    });
  },

  // Friends methods
  sendFriendRequest: (fromUser, toUser) => {
    return new Promise((resolve, reject) => {
      const [userA, userB] = [fromUser, toUser].sort();

      db.run(
        `INSERT OR IGNORE INTO friends (user1, user2, status) VALUES (?, ?, 'pending')`,
        [userA, userB],
        (err) => {
          if (err) {
            console.error("❌ Error in sendFriendRequest:", err);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  },

  getPendingRequests: (username) => {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT 
          CASE 
            WHEN user1 = ? THEN user2
            ELSE user1
          END as friend_username,
          created_at
         FROM friends 
         WHERE (user1 = ? OR user2 = ?) 
         AND status = 'pending'
         ORDER BY created_at DESC`,
        [username, username, username],
        (err, rows) => {
          if (err) {
            console.error("❌ Error in getPendingRequests:", err);
            reject(err);
          } else {
            resolve(rows || []);
          }
        }
      );
    });
  },

  respondToFriendRequest: (username, friendUsername, accept) => {
    return new Promise((resolve, reject) => {
      const [userA, userB] = [username, friendUsername].sort();
      const newStatus = accept ? "accepted" : "rejected";

      db.run(
        `UPDATE friends SET status = ?, responded_at = datetime('now') 
         WHERE user1 = ? AND user2 = ? AND status = 'pending'`,
        [newStatus, userA, userB],
        (err) => {
          if (err) {
            console.error("❌ Error in respondToFriendRequest:", err);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  },

  getFriends: (username) => {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT 
          CASE 
            WHEN user1 = ? THEN user2
            ELSE user1
          END as friend_username,
          created_at
         FROM friends 
         WHERE (user1 = ? OR user2 = ?) 
         AND status = 'accepted'
         ORDER BY created_at DESC`,
        [username, username, username],
        (err, rows) => {
          if (err) {
            console.error("❌ Error in getFriends:", err);
            reject(err);
          } else {
            resolve(rows || []);
          }
        }
      );
    });
  },

  areFriends: (user1, user2) => {
    return new Promise((resolve, reject) => {
      const [userA, userB] = [user1, user2].sort();

      db.get(
        `SELECT 1 FROM friends WHERE user1 = ? AND user2 = ? AND status = 'accepted'`,
        [userA, userB],
        (err, row) => {
          if (err) {
            console.error("❌ Error in areFriends:", err);
            reject(err);
          } else {
            resolve(!!row);
          }
        }
      );
    });
  },

  removeFriend: (user1, user2) => {
    return new Promise((resolve, reject) => {
      const [userA, userB] = [user1, user2].sort();

      db.run(`DELETE FROM friends WHERE user1 = ? AND user2 = ?`, [userA, userB], (err) => {
        if (err) {
          console.error("❌ Error in removeFriend:", err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  },

  hasPendingRequest: (user1, user2) => {
    return new Promise((resolve, reject) => {
      const [userA, userB] = [user1, user2].sort();

      db.get(
        `SELECT 1 FROM friends WHERE user1 = ? AND user2 = ? AND status = 'pending'`,
        [userA, userB],
        (err, row) => {
          if (err) {
            console.error("❌ Error in hasPendingRequest:", err);
            reject(err);
          } else {
            resolve(!!row);
          }
        }
      );
    });
  },
};

module.exports = { dbHelpers, db };
