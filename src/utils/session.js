const sessions = new Map();
const get   = id => sessions.get(id) || {};
const set   = (id, d) => sessions.set(id, { ...get(id), ...d });
const clear = id => sessions.delete(id);
module.exports = { get, set, clear };
