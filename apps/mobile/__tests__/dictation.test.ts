import { appendDictation, resolveSpeechLocale, speechLocale } from '@/data/dictation';

describe('speechLocale', () => {
  it('follows the app language', () => {
    expect(speechLocale('en')).toBe('en-US');
    expect(speechLocale('nl')).toBe('nl-NL');
  });
});

describe('resolveSpeechLocale', () => {
  it('uses the installed pack for the exact locale', () => {
    expect(resolveSpeechLocale('nl', ['nl-NL', 'en-US'], ['nl-NL'])).toEqual({ kind: 'installed', locale: 'nl-NL' });
  });

  it('accepts another region of the same language that is installed', () => {
    expect(resolveSpeechLocale('en', ['en-GB'], ['en-GB'])).toEqual({ kind: 'installed', locale: 'en-GB' });
    expect(resolveSpeechLocale('nl', ['nl_BE'], ['nl_BE'])).toEqual({ kind: 'installed', locale: 'nl_BE' });
  });

  it('prefers the exact locale over a sibling region', () => {
    expect(resolveSpeechLocale('en', ['en-GB', 'en-US'], ['en-GB', 'en-US'])).toEqual({ kind: 'installed', locale: 'en-US' });
  });

  it('offers a download when the pack is supported but not installed', () => {
    expect(resolveSpeechLocale('nl', ['nl-NL', 'en-US'], ['en-US'])).toEqual({ kind: 'downloadable', locale: 'nl-NL' });
  });

  it('reports a missing language when neither list has it', () => {
    expect(resolveSpeechLocale('nl', ['en-US', 'de-DE'], ['en-US'])).toEqual({ kind: 'missing' });
    expect(resolveSpeechLocale('en', [], [])).toEqual({ kind: 'missing' });
  });

  it('never mistakes a language that only shares a prefix', () => {
    expect(resolveSpeechLocale('en', ['eng-XX'], ['eng-XX'])).toEqual({ kind: 'missing' });
  });
});

describe('appendDictation', () => {
  it('starts an empty draft with the text', () => {
    expect(appendDictation('', ' hello there ')).toBe('hello there');
    expect(appendDictation('   ', 'hello')).toBe('hello');
  });

  it('joins with one space and keeps what was typed', () => {
    expect(appendDictation('Slept badly.', 'Late dinner.')).toBe('Slept badly. Late dinner.');
    expect(appendDictation('Slept badly. ', 'Late dinner.')).toBe('Slept badly. Late dinner.');
    expect(appendDictation('Line one\n', 'line two')).toBe('Line one\nline two');
  });

  it('ignores an empty transcript', () => {
    expect(appendDictation('keep', '  ')).toBe('keep');
  });
});
