/**
 * Application configuration.
 *
 * The API base URL defaults to http://localhost:3001 for local development.
 * In production, set the VITE_API_BASE_URL environment variable to the
 * deployed backend URL.
 */

// Vite exposes env vars prefixed with VITE_ on import.meta.env
const envBase =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL;

export const API_BASE_URL: string = envBase || 'http://localhost:3001';
