-- Exact database schema shipped before voice triggers (user_version=0).
PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS operators (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL COLLATE NOCASE UNIQUE,
        agencyId TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('admin','dispatcher','observer')),
        passwordHash TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        tokenHash TEXT PRIMARY KEY, operatorId TEXT NOT NULL REFERENCES operators(id),
        createdAt TEXT NOT NULL, expiresAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS women (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, reference TEXT NOT NULL,
        notes TEXT NOT NULL, agencyId TEXT NOT NULL, createdAt TEXT NOT NULL,
        UNIQUE (agencyId, reference)
      );
      CREATE TABLE IF NOT EXISTS pairings (
        codeHash TEXT PRIMARY KEY, womanId TEXT NOT NULL REFERENCES women(id),
        expiresAt TEXT NOT NULL, usedAt TEXT, createdAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY, womanId TEXT NOT NULL REFERENCES women(id), tokenHash TEXT NOT NULL UNIQUE,
        consentVersion TEXT NOT NULL, consentLocation INTEGER NOT NULL CHECK(consentLocation = 1),
        consentAudio INTEGER NOT NULL, createdAt TEXT NOT NULL, revokedAt TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS one_active_device ON devices(womanId) WHERE revokedAt IS NULL;
      CREATE TABLE IF NOT EXISTS incidents (
        id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, womanId TEXT NOT NULL REFERENCES women(id),
        deviceId TEXT NOT NULL REFERENCES devices(id), agencyId TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('new','assigned','resolved')),
        simulated INTEGER NOT NULL, trigger TEXT NOT NULL CHECK(trigger IN ('hold','volume','notification')),
        createdAt TEXT NOT NULL, receivedAt TEXT NOT NULL, acknowledgedAt TEXT,
        assignedTo TEXT REFERENCES operators(id), resolvedAt TEXT, resolution TEXT,
        revision INTEGER NOT NULL DEFAULT 1
      );
      CREATE UNIQUE INDEX IF NOT EXISTS one_open_incident ON incidents(deviceId) WHERE status != 'resolved';
      CREATE INDEX IF NOT EXISTS incidents_agency ON incidents(agencyId, receivedAt DESC);
      CREATE TABLE IF NOT EXISTS client_events (
        deviceId TEXT NOT NULL REFERENCES devices(id), clientEventId TEXT NOT NULL,
        incidentId TEXT NOT NULL REFERENCES incidents(id), PRIMARY KEY(deviceId, clientEventId)
      );
      CREATE TABLE IF NOT EXISTS locations (
        incidentId TEXT NOT NULL REFERENCES incidents(id), sequence INTEGER NOT NULL,
        latitude REAL NOT NULL, longitude REAL NOT NULL, accuracy REAL NOT NULL,
        capturedAt TEXT NOT NULL, receivedAt TEXT NOT NULL, battery REAL,
        PRIMARY KEY(incidentId, sequence)
      );
      CREATE TABLE IF NOT EXISTS audio_chunks (
        id TEXT PRIMARY KEY, incidentId TEXT NOT NULL REFERENCES incidents(id), sequence INTEGER NOT NULL,
        capturedAt TEXT NOT NULL, receivedAt TEXT NOT NULL, mimeType TEXT NOT NULL, data BLOB NOT NULL,
        UNIQUE(incidentId, sequence)
      );
      CREATE TABLE IF NOT EXISTS audit (
        id TEXT PRIMARY KEY, agencyId TEXT NOT NULL, action TEXT NOT NULL, actorName TEXT NOT NULL,
        incidentId TEXT REFERENCES incidents(id), createdAt TEXT NOT NULL, detail TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS audit_agency ON audit(agencyId, createdAt DESC);
      CREATE TABLE IF NOT EXISTS change_events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, agencyId TEXT NOT NULL, kind TEXT NOT NULL,
        incidentId TEXT REFERENCES incidents(id), createdAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS changes_agency ON change_events(agencyId, seq);
