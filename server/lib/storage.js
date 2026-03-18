'use strict';

/**
 * S3-compatible object storage abstraction.
 *
 * Provides a unified interface for file storage with two backends:
 *   - LocalStorage  – writes to the local filesystem under data/uploads/
 *   - S3Storage     – uses AWS SDK v3 (dynamically imported to avoid hard dep)
 *
 * The exported `storage` singleton auto-selects S3Storage when the S3_BUCKET
 * env var is set; otherwise it falls back to LocalStorage.
 *
 * Environment variables (S3Storage):
 *   S3_BUCKET     - bucket name (required to enable S3)
 *   S3_REGION     - AWS region           (default: 'us-east-1')
 *   S3_ACCESS_KEY - access key ID
 *   S3_SECRET_KEY - secret access key
 *   S3_ENDPOINT   - custom endpoint for MinIO / compatible services
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger').child({ module: 'storage' });

// ---------------------------------------------------------------------------
// Base interface (documenting the contract)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} StorageBackend
 * @property {(key: string, buffer: Buffer, contentType?: string) => Promise<string>} upload
 * @property {(key: string) => Promise<Buffer>} download
 * @property {(key: string) => Promise<void>} delete
 * @property {(key: string) => Promise<boolean>} exists
 * @property {(key: string) => Promise<string>} getUrl
 */

// ---------------------------------------------------------------------------
// LocalStorage
// ---------------------------------------------------------------------------

class LocalStorage {
  /**
   * @param {object} [opts]
   * @param {string} [opts.baseDir] - root directory for uploads
   */
  constructor(opts = {}) {
    this.baseDir = opts.baseDir || path.resolve(process.cwd(), 'data', 'uploads');
    this._ensureDir(this.baseDir);
    logger.info({ baseDir: this.baseDir }, 'LocalStorage initialised');
  }

  /** Upload a file to the local filesystem. Returns the absolute file path. */
  async upload(key, buffer, _contentType) {
    const filePath = this._resolve(key);
    this._ensureDir(path.dirname(filePath));
    await fs.promises.writeFile(filePath, buffer);
    logger.debug({ key }, 'file uploaded (local)');
    return filePath;
  }

  /** Download a file and return its contents as a Buffer. */
  async download(key) {
    const filePath = this._resolve(key);
    return fs.promises.readFile(filePath);
  }

  /** Delete a file. Silently succeeds if the file does not exist. */
  async delete(key) {
    const filePath = this._resolve(key);
    try {
      await fs.promises.unlink(filePath);
      logger.debug({ key }, 'file deleted (local)');
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  /** Check whether a file exists. */
  async exists(key) {
    const filePath = this._resolve(key);
    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /** Return the absolute path for a stored file. */
  async getUrl(key) {
    return this._resolve(key);
  }

  // -- Internals ------------------------------------------------------------

  _resolve(key) {
    // Prevent directory traversal by stripping leading slashes / ".."
    const safe = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, '');
    return path.join(this.baseDir, safe);
  }

  _ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ---------------------------------------------------------------------------
// S3Storage
// ---------------------------------------------------------------------------

class S3Storage {
  /**
   * @param {object} opts
   * @param {string} opts.bucket     - S3 bucket name
   * @param {string} [opts.region]   - AWS region
   * @param {string} [opts.accessKeyId]
   * @param {string} [opts.secretAccessKey]
   * @param {string} [opts.endpoint] - custom endpoint (MinIO, etc.)
   */
  constructor(opts = {}) {
    this.bucket = opts.bucket;
    this.region = opts.region || 'us-east-1';
    this.endpoint = opts.endpoint || undefined;

    this._clientConfig = {
      region: this.region,
      ...(opts.accessKeyId && opts.secretAccessKey
        ? { credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey } }
        : {}),
      ...(this.endpoint ? { endpoint: this.endpoint, forcePathStyle: true } : {}),
    };

    // Lazily resolved – see _getClient()
    this._client = null;

    logger.info(
      { bucket: this.bucket, region: this.region, endpoint: this.endpoint || '(default)' },
      'S3Storage initialised',
    );
  }

  /** Upload a file to S3. Returns the object URL. */
  async upload(key, buffer, contentType) {
    const client = await this._getClient();
    const { PutObjectCommand } = await _loadSdk();

    await client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ...(contentType ? { ContentType: contentType } : {}),
    }));

    logger.debug({ key, bucket: this.bucket }, 'file uploaded (S3)');
    return this.getUrl(key);
  }

  /** Download a file from S3 and return its contents as a Buffer. */
  async download(key) {
    const client = await this._getClient();
    const { GetObjectCommand } = await _loadSdk();

    const res = await client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }));

    // res.Body is a readable stream in SDK v3
    return _streamToBuffer(res.Body);
  }

  /** Delete an object from S3. */
  async delete(key) {
    const client = await this._getClient();
    const { DeleteObjectCommand } = await _loadSdk();

    await client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }));

    logger.debug({ key, bucket: this.bucket }, 'file deleted (S3)');
  }

  /** Check whether an object exists in S3. */
  async exists(key) {
    const client = await this._getClient();
    const { HeadObjectCommand } = await _loadSdk();

    try {
      await client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));
      return true;
    } catch (err) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw err;
    }
  }

  /**
   * Get the URL for an object.
   *
   * When a custom endpoint is configured (MinIO, etc.) the URL uses that
   * endpoint with path-style addressing. Otherwise it uses the standard
   * virtual-hosted-style S3 URL.
   */
  async getUrl(key) {
    const encodedKey = encodeURIComponent(key).replace(/%2F/g, '/');
    if (this.endpoint) {
      const base = this.endpoint.replace(/\/+$/, '');
      return `${base}/${this.bucket}/${encodedKey}`;
    }
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${encodedKey}`;
  }

  // -- Internals ------------------------------------------------------------

  async _getClient() {
    if (this._client) return this._client;

    const { S3Client } = await _loadSdk();
    this._client = new S3Client(this._clientConfig);
    return this._client;
  }
}

// ---------------------------------------------------------------------------
// AWS SDK helpers (dynamic import so the module doesn't fail without SDK)
// ---------------------------------------------------------------------------

let _sdkCache = null;

async function _loadSdk() {
  if (_sdkCache) return _sdkCache;

  try {
    // Dynamic require – keeps the dependency optional
    _sdkCache = require('@aws-sdk/client-s3');
  } catch {
    throw new Error(
      'AWS SDK v3 is required for S3 storage. Install it with: npm install @aws-sdk/client-s3',
    );
  }

  return _sdkCache;
}

/** Convert a readable stream (SDK v3 Body) to a Buffer. */
async function _streamToBuffer(stream) {
  // If it's already a Buffer / Uint8Array (e.g. in tests)
  if (Buffer.isBuffer(stream)) return stream;
  if (stream instanceof Uint8Array) return Buffer.from(stream);

  // SDK v3 provides a transformToByteArray helper on the body
  if (typeof stream.transformToByteArray === 'function') {
    const bytes = await stream.transformToByteArray();
    return Buffer.from(bytes);
  }

  // Fallback: manually consume a Node.js readable stream
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a storage backend based on environment variables.
 *
 * Returns S3Storage when S3_BUCKET is set, otherwise LocalStorage.
 */
function createStorage() {
  const bucket = process.env.S3_BUCKET;

  if (bucket) {
    return new S3Storage({
      bucket,
      region: process.env.S3_REGION,
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_KEY,
      endpoint: process.env.S3_ENDPOINT,
    });
  }

  logger.info('S3_BUCKET not set – using local filesystem storage');
  return new LocalStorage();
}

// Singleton
const storage = createStorage();

module.exports = storage;
module.exports.storage = storage;
module.exports.LocalStorage = LocalStorage;
module.exports.S3Storage = S3Storage;
module.exports.createStorage = createStorage;
