import { MESSAGES_URL } from '@/coach/api';
import { LAB_SCHEMA, buildLabRequestBody, readLabReply, requestLabExtraction } from '@/data/labImport/claude';
import { isRecord, parseJson, type Json } from '@/lib/json';
import { NetworkRefusedError, checkRequest, type GatedFetch } from '@/net/gate';
import { defaultNetworkPrefs } from '@/net/features';

import { TEST_KEY, jsonResponse, messageBody } from './support/coach';

const TODAY = '2026-11-25';
const PDF = { kind: 'pdf' as const, base64: 'JVBERi0xLjQK' };

function entry(patch: { [key: string]: Json } = {}): { [key: string]: Json } {
  return { biomarker: 'glucose', name: 'Glucose nuchter', value: 5.2, censored: null, unit: 'mmol/L', refLow: 3.9, refHigh: 5.5, day: '2026-11-18', ...patch };
}

function reply(results: Json[]): string {
  return JSON.stringify({ results });
}

function body(model: Parameters<typeof buildLabRequestBody>[0], upload: Parameters<typeof buildLabRequestBody>[1]): { [key: string]: Json } {
  const parsed = parseJson(buildLabRequestBody(model, upload));
  if (!isRecord(parsed)) throw new Error('body is not an object');
  return parsed;
}

describe('lab request body', () => {
  it('sends the PDF as a document block with the structured-output schema', () => {
    const sent = body('claude-sonnet-5-5', PDF);
    expect(sent.model).toBe('claude-sonnet-5-5');
    expect(sent.fallbacks).toBe('default');
    expect(sent.output_config).toEqual({ effort: 'medium', format: { type: 'json_schema', schema: LAB_SCHEMA } });
    expect(sent.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: PDF.base64 } },
          { type: 'text', text: 'Copy the test results from this lab report.' },
        ],
      },
    ]);
    expect(typeof sent.system === 'string' && sent.system.includes('ferritin')).toBe(true);
  });

  it('sends a photo as an image block and leaves fallbacks off for Haiku', () => {
    const sent = body('claude-haiku-5-5', { kind: 'image', mediaType: 'image/jpeg', base64: '/9j/AAAA' });
    expect(sent.fallbacks).toBeUndefined();
    const messages = sent.messages;
    const first = Array.isArray(messages) ? messages[0] : undefined;
    const content = isRecord(first) && Array.isArray(first.content) ? first.content[0] : undefined;
    expect(content).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: '/9j/AAAA' } });
  });

  it('only lets catalogue ids or null into the biomarker field', () => {
    const text = JSON.stringify(LAB_SCHEMA);
    expect(text).toContain('"enum":["glucose","hba1c"');
    expect(text).toContain('"additionalProperties":false');
  });
});

describe('lab reply validation', () => {
  it('accepts a well-formed result', () => {
    expect(readLabReply(reply([entry()]), TODAY)).toEqual({
      ok: true,
      dropped: 0,
      candidates: [{ name: 'Glucose nuchter', biomarker: 'glucose', value: 5.2, censored: null, unit: 'mmol/L', refLow: 3.9, refHigh: 5.5, day: '2026-11-18' }],
    });
  });

  it('normalises units and unmaps a biomarker whose unit does not fit', () => {
    const result = readLabReply(reply([entry({ unit: 'mmol/l' }), entry({ biomarker: 'haemoglobin', name: 'Hb', unit: 'mmol/l', value: 8.9, refLow: 8.5, refHigh: 11 }), entry({ unit: 'U/L' })]), TODAY);
    expect(result.ok && result.candidates.map((c) => [c.biomarker, c.unit])).toEqual([
      ['glucose', 'mmol/L'],
      [null, 'mmol/L'],
      [null, 'U/L'],
    ]);
  });

  it('never trusts an unknown biomarker id', () => {
    const result = readLabReply(reply([entry({ biomarker: 'creatinine' }), entry({ biomarker: 42 })]), TODAY);
    expect(result.ok && result.candidates.map((c) => c.biomarker)).toEqual([null, null]);
  });

  it('drops entries without a usable name or value', () => {
    const result = readLabReply(
      reply([entry({ value: '5.2' }), entry({ value: -1 }), entry({ value: 2_000_000 }), entry({ value: null }), entry({ name: '   ' }), entry({ name: 7 }), 'text', null, entry()]),
      TODAY,
    );
    expect(result).toMatchObject({ ok: true, dropped: 8 });
    expect(result.ok && result.candidates).toHaveLength(1);
  });

  it('cleans names, ranges, censored values and dates', () => {
    const result = readLabReply(
      reply([
        entry({ name: 'Glu\u0000cose\n nuchter '.padEnd(90, 'x'), refLow: 6, refHigh: 5, day: '2026-12-01', censored: '≤', value: 5.123456 }),
        entry({ censored: '<', day: 'yesterday', refLow: Number.NaN }),
        entry({ day: '1999-01-01' }),
      ]),
      TODAY,
    );
    if (!result.ok) throw new Error('expected ok');
    const [first, second, third] = result.candidates;
    expect(first?.name.length).toBeLessThanOrEqual(60);
    expect(first?.name.startsWith('Glu cose nuchter')).toBe(true);
    expect(first).toMatchObject({ refLow: null, refHigh: null, day: null, censored: null, value: 5.1235 });
    expect(second).toMatchObject({ censored: '<', day: null, refLow: null, refHigh: 5.5 });
    expect(third?.day).toBeNull();
  });

  it('caps the number of results', () => {
    const result = readLabReply(reply(Array.from({ length: 250 }, (_, i) => entry({ value: i }))), TODAY);
    expect(result).toMatchObject({ ok: true, dropped: 50 });
  });

  it('rejects text that is not the expected JSON', () => {
    expect(readLabReply('not json', TODAY)).toEqual({ ok: false, error: 'invalid-response' });
    expect(readLabReply('{"results":"x"}', TODAY)).toEqual({ ok: false, error: 'invalid-response' });
    expect(readLabReply('[]', TODAY)).toEqual({ ok: false, error: 'invalid-response' });
  });
});

describe('lab request', () => {
  const request = { apiKey: TEST_KEY, model: 'claude-sonnet-5-5' as const, upload: PDF, today: TODAY };

  it('posts through the labs network feature and reads the reply', async () => {
    const send = jest.fn<Promise<Response>, Parameters<GatedFetch>>(async () => jsonResponse(200, messageBody(reply([entry()]))));
    const result = await requestLabExtraction(send, request);
    expect(result).toMatchObject({ ok: true, candidates: [{ biomarker: 'glucose' }] });
    const [feature, url, init] = send.mock.calls[0] ?? [];
    expect(feature).toBe('labs');
    expect(url).toBe(MESSAGES_URL);
    expect(init?.headers).toMatchObject({ 'x-api-key': TEST_KEY, 'anthropic-beta': 'server-side-fallback-2026-07-01' });
  });

  it('maps API failures to the coach error kinds', async () => {
    const cases: Array<[Response | Error, string]> = [
      [jsonResponse(401, {}), 'invalid-key'],
      [jsonResponse(413, {}), 'rejected'],
      [jsonResponse(529, {}), 'overloaded'],
      [jsonResponse(200, messageBody('', 'refusal')), 'refused'],
      [jsonResponse(200, messageBody('{"results":[', 'max_tokens')), 'incomplete'],
      [new NetworkRefusedError('feature-off'), 'network-off'],
      [new TypeError('Network request failed'), 'network'],
    ];
    for (const [outcome, error] of cases) {
      const send = jest.fn<Promise<Response>, Parameters<GatedFetch>>(async () => {
        if (outcome instanceof Error) throw outcome;
        return outcome;
      });
      await expect(requestLabExtraction(send, request)).resolves.toEqual({ ok: false, error });
    }
  });

  it('is refused by the gate unless the labs feature is on', () => {
    const prefs = defaultNetworkPrefs();
    expect(checkRequest(prefs, 'labs', MESSAGES_URL)).toEqual({ allowed: false, reason: 'network-off' });
    expect(checkRequest({ enabled: true, features: { coach: true, maps: false, labs: false } }, 'labs', MESSAGES_URL)).toEqual({ allowed: false, reason: 'feature-off' });
    expect(checkRequest({ enabled: true, features: { coach: false, maps: false, labs: true } }, 'labs', MESSAGES_URL)).toEqual({ allowed: true });
    expect(checkRequest({ enabled: true, features: { coach: false, maps: false, labs: true } }, 'labs', 'https://tile.openstreetmap.org/1/0/0.png')).toEqual({
      allowed: false,
      reason: 'host-not-allowed',
    });
  });
});
