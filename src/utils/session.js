const sessions = new Map();
const get   = id => sessions.get(id) || {};
const set   = (id, d) => sessions.set(id, { ...get(id), ...d });
const unset = (id, keys = []) => {
  const curr = get(id);
  const next = { ...curr };
  keys.forEach(k => delete next[k]);
  sessions.set(id, next);
};
const clear = id => sessions.delete(id);
module.exports = { get, set, unset, clear };