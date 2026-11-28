// Bump when a decoder change alters what is stored from the same frames (samples, battery pack events, optical and motion signals); stored data is then re-decoded.
export const SAMPLE_DECODER_VERSION = 3;

// Bump when day records gain or change a value, so stored days are recomputed once.
export const DAY_RECORD_VERSION = 10;

export { SCHEMA_VERSION } from './store/migrations';
