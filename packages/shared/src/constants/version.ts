/**
 * Protocol version — bump when client/server communication changes
 * in a backwards-incompatible way (new message types, schema changes, etc.).
 *
 * The server rejects clients below MIN_PROTOCOL_VERSION.
 */
export const PROTOCOL_VERSION = 1;
export const MIN_PROTOCOL_VERSION = 1;
