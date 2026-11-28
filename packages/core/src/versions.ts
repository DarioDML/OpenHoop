// Bump when a decoder change alters what is stored from the same frames (samples or battery pack events); stored data is then re-decoded.
export const SAMPLE_DECODER_VERSION = 2;

// Bump when day records gain or change a value, so stored days are recomputed once.
export const DAY_RECORD_VERSION = 9;

export { SCHEMA_VERSION } from './store/migrations';
