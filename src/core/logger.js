const listeners = new Set();

export const log = (level, source, message, data) => {
  const entry = { ts: Date.now(), level, source, message, data: data ?? null };
  const line = `[${new Date().toISOString()}] ${level.toUpperCase().padEnd(6)} ${source}: ${message}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
  listeners.forEach((fn) => fn(entry));
};

export const onLog = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const info = (s, m, d) => log('info', s, m, d);
export const warn = (s, m, d) => log('warn', s, m, d);
export const error = (s, m, d) => log('error', s, m, d);
export const success = (s, m, d) => log('success', s, m, d);