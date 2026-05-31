const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const dataDir = process.env.VERCEL
  ? path.join('/tmp', 'likes-data')
  : path.join(__dirname, 'data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'likes.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

migrateToVoters();

function migrateToVoters() {
  const votersTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='voters'")
    .get();

  if (votersTable) {
    return;
  }

  db.exec(`
    CREATE TABLE voters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
  `);

  const voteColumns = db.prepare('PRAGMA table_info(votes)').all();
  const hasSessionVotes = voteColumns.some((column) => column.name === 'session_id');

  if (hasSessionVotes) {
    const legacySessions = db
      .prepare('SELECT DISTINCT session_id FROM votes')
      .all();

    db.exec(`
      CREATE TABLE votes_new (
        voter_id INTEGER NOT NULL,
        image_id TEXT NOT NULL,
        liked INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (voter_id, image_id),
        FOREIGN KEY (voter_id) REFERENCES voters(id) ON DELETE CASCADE
      );
    `);

    const insertVoter = db.prepare(
      'INSERT INTO voters (session_id, token, name) VALUES (?, ?, ?)'
    );
    const insertVote = db.prepare(
      'INSERT INTO votes_new (voter_id, image_id, liked, updated_at) VALUES (?, ?, ?, ?)'
    );
    const legacyVotes = db.prepare(
      'SELECT image_id, liked, updated_at FROM votes WHERE session_id = ?'
    );

    for (const row of legacySessions) {
      const voter = insertVoter.run(
        row.session_id,
        `legacy-${row.session_id}-${uuidv4().slice(0, 8)}`,
        'Legacy'
      );
      for (const vote of legacyVotes.all(row.session_id)) {
        insertVote.run(voter.lastInsertRowid, vote.image_id, vote.liked, vote.updated_at);
      }
    }

    db.exec('DROP TABLE votes');
    db.exec('ALTER TABLE votes_new RENAME TO votes');
    return;
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS votes (
      voter_id INTEGER NOT NULL,
      image_id TEXT NOT NULL,
      liked INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (voter_id, image_id),
      FOREIGN KEY (voter_id) REFERENCES voters(id) ON DELETE CASCADE
    );
  `);
}

function createSession(token) {
  try {
    const result = db.prepare('INSERT INTO sessions (token) VALUES (?)').run(token);
    return { id: result.lastInsertRowid, token };
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return null;
    }
    throw error;
  }
}

function getSessionByToken(token) {
  return db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
}

function getAllSessions() {
  return db.prepare('SELECT * FROM sessions ORDER BY created_at DESC').all();
}

function createVoter(sessionId, name) {
  const token = uuidv4().slice(0, 12);
  const result = db
    .prepare('INSERT INTO voters (session_id, token, name) VALUES (?, ?, ?)')
    .run(sessionId, token, name);
  return {
    id: result.lastInsertRowid,
    token,
    name,
  };
}

function getVoterByToken(token) {
  return db
    .prepare(`
      SELECT v.*, s.token AS session_token
      FROM voters v
      JOIN sessions s ON s.id = v.session_id
      WHERE v.token = ?
    `)
    .get(token);
}

function getVotersForSession(sessionId) {
  return db
    .prepare('SELECT * FROM voters WHERE session_id = ? ORDER BY created_at ASC')
    .all(sessionId);
}

function getVoterCount(sessionId) {
  return db
    .prepare('SELECT COUNT(*) AS count FROM voters WHERE session_id = ?')
    .get(sessionId).count;
}

function setVote(voterId, imageId, liked) {
  db.prepare(`
    INSERT INTO votes (voter_id, image_id, liked, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(voter_id, image_id) DO UPDATE SET
      liked = excluded.liked,
      updated_at = excluded.updated_at
  `).run(voterId, imageId, liked ? 1 : 0);
}

function getVotesForVoter(voterId) {
  return db
    .prepare('SELECT image_id, liked FROM votes WHERE voter_id = ?')
    .all(voterId);
}

function getVoterSessionStats(sessionId, totalImages) {
  const voters = getVotersForSession(sessionId);
  let completed = 0;
  let incomplete = 0;

  const countVotes = db.prepare(
    'SELECT COUNT(*) AS count FROM votes WHERE voter_id = ?'
  );

  for (const voter of voters) {
    const voteCount = countVotes.get(voter.id).count;
    if (voteCount >= totalImages && totalImages > 0) {
      completed += 1;
    } else {
      incomplete += 1;
    }
  }

  return { completed, incomplete };
}

function deleteSessionByToken(token) {
  const result = db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  return result.changes > 0;
}

function getVotesForSession(sessionId) {
  return db
    .prepare(`
      SELECT v.image_id, v.liked, vr.name AS voter_name, vr.token AS voter_token
      FROM votes v
      JOIN voters vr ON vr.id = v.voter_id
      WHERE vr.session_id = ?
    `)
    .all(sessionId);
}

module.exports = {
  createSession,
  getSessionByToken,
  getAllSessions,
  createVoter,
  getVoterByToken,
  getVotersForSession,
  getVoterCount,
  getVoterSessionStats,
  deleteSessionByToken,
  setVote,
  getVotesForVoter,
  getVotesForSession,
};
