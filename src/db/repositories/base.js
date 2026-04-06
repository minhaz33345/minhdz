const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');
const fs = require('fs');
const { DEFAULT_DB } = require('../schema');

const DATA_DIR = path.join(__dirname, '..', '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const adapter = new FileSync(path.join(DATA_DIR, 'db.json'));
const db = low(adapter);
db.defaults(DEFAULT_DB).write();

module.exports = db;