'use strict';

/**
 * Structured logging module with a pino-compatible API.
 *
 * Uses pino when available; otherwise falls back to a lightweight built-in
 * logger that produces structured JSON output with level filtering, child
 * logger support, and ISO-8601 timestamps.
 *
 * Configuration:
 *   LOG_LEVEL  - one of: debug, info, warn, error, fatal  (default: 'info')
 *   NODE_ENV   - when set to 'development', pino-pretty is used (if installed)
 */

const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

const LEVEL_NAMES = Object.fromEntries(
  Object.entries(LEVELS).map(([name, num]) => [num, name]),
);

// ---------------------------------------------------------------------------
// Built-in lightweight logger (pino-compatible subset)
// ---------------------------------------------------------------------------

class Logger {
  /**
   * @param {object} opts
   * @param {string} opts.level        - minimum log level
   * @param {object} opts.bindings     - static fields merged into every record
   * @param {boolean} opts.pretty      - human-readable output instead of JSON
   */
  constructor(opts = {}) {
    const levelName = (opts.level || 'info').toLowerCase();
    this._levelValue = LEVELS[levelName] ?? LEVELS.info;
    this._bindings = opts.bindings || {};
    this._pretty = Boolean(opts.pretty);
    this._stream = opts.stream || process.stdout;
  }

  // -- Public API -----------------------------------------------------------

  /** Create a child logger that inherits settings and adds extra context. */
  child(bindings = {}) {
    return new Logger({
      level: LEVEL_NAMES[this._levelValue],
      bindings: { ...this._bindings, ...bindings },
      pretty: this._pretty,
      stream: this._stream,
    });
  }

  debug(msgOrObj, msg) { this._log('debug', LEVELS.debug, msgOrObj, msg); }
  info(msgOrObj, msg)  { this._log('info',  LEVELS.info,  msgOrObj, msg); }
  warn(msgOrObj, msg)  { this._log('warn',  LEVELS.warn,  msgOrObj, msg); }
  error(msgOrObj, msg) { this._log('error', LEVELS.error, msgOrObj, msg); }
  fatal(msgOrObj, msg) { this._log('fatal', LEVELS.fatal, msgOrObj, msg); }

  /** Current level name. */
  get level() {
    return LEVEL_NAMES[this._levelValue];
  }

  set level(name) {
    const v = LEVELS[name.toLowerCase()];
    if (v !== undefined) this._levelValue = v;
  }

  // -- Internals ------------------------------------------------------------

  _log(levelName, levelValue, msgOrObj, msg) {
    if (levelValue < this._levelValue) return;

    let extra = {};
    let message;

    if (typeof msgOrObj === 'string') {
      message = msgOrObj;
    } else if (msgOrObj instanceof Error) {
      extra = {
        err: {
          type: msgOrObj.constructor.name,
          message: msgOrObj.message,
          stack: msgOrObj.stack,
        },
      };
      message = msg || msgOrObj.message;
    } else if (typeof msgOrObj === 'object' && msgOrObj !== null) {
      extra = msgOrObj;
      message = msg;
    }

    const record = {
      level: levelName,
      time: new Date().toISOString(),
      ...this._bindings,
      ...extra,
      ...(message !== undefined ? { msg: message } : {}),
    };

    if (this._pretty) {
      this._writePretty(record, levelName);
    } else {
      this._stream.write(JSON.stringify(record) + '\n');
    }
  }

  _writePretty(record, levelName) {
    const colors = {
      debug: '\x1b[36m',  // cyan
      info:  '\x1b[32m',  // green
      warn:  '\x1b[33m',  // yellow
      error: '\x1b[31m',  // red
      fatal: '\x1b[35m',  // magenta
    };
    const reset = '\x1b[0m';
    const color = colors[levelName] || '';
    const tag = `${color}${levelName.toUpperCase().padEnd(5)}${reset}`;

    const { level: _l, time, msg, module: mod, requestId, err, ...rest } = record;

    const parts = [
      `[${time}]`,
      tag,
    ];
    if (mod) parts.push(`(${mod})`);
    if (requestId) parts.push(`[req:${requestId}]`);
    if (msg) parts.push(msg);

    const extraKeys = Object.keys(rest);
    if (extraKeys.length > 0) {
      parts.push(JSON.stringify(rest));
    }
    if (err) {
      parts.push(`\n  ${err.stack || err.message}`);
    }

    this._stream.write(parts.join(' ') + '\n');
  }
}

// ---------------------------------------------------------------------------
// Factory: prefer pino when available, otherwise use built-in Logger
// ---------------------------------------------------------------------------

function createLogger() {
  const level = (process.env.LOG_LEVEL || 'info').toLowerCase();
  const isDev = process.env.NODE_ENV === 'development';

  // Try pino first
  try {
    const pino = require('pino');
    const opts = {
      level,
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level(label) {
          return { level: label };
        },
      },
    };

    if (isDev) {
      try {
        const pretty = require('pino-pretty');
        return pino(opts, pretty({ colorize: true, translateTime: 'SYS:standard' }));
      } catch (_) {
        // pino-pretty not installed; use pino with default transport
      }
    }

    return pino(opts);
  } catch (_) {
    // pino not installed; fall back to built-in logger
  }

  return new Logger({ level, pretty: isDev });
}

const logger = createLogger();

module.exports = logger;
module.exports.Logger = Logger;
module.exports.createLogger = createLogger;
