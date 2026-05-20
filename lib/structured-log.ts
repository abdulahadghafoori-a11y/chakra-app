type LogLevel = "info" | "warn" | "error";

function write(level: LogLevel, event: string, fields?: Record<string, unknown>) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const log = {
  info: (event: string, fields?: Record<string, unknown>) =>
    write("info", event, fields),
  warn: (event: string, fields?: Record<string, unknown>) =>
    write("warn", event, fields),
  error: (event: string, fields?: Record<string, unknown>) =>
    write("error", event, fields),
};
