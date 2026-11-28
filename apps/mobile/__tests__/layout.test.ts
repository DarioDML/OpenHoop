import { COMPACT_GUTTER, GUTTER, breaksMidWord, fitArt, fitFontSize, heroRingSize, layoutFor } from '@/ui/layout';

describe('layoutFor', () => {
  it('keeps the roomy layout on a wide phone at normal text size', () => {
    const layout = layoutFor(412, 915, 1);
    expect(layout.compact).toBe(false);
    expect(layout.gutter).toBe(GUTTER);
  });

  it('goes compact on a 360dp phone with larger text, like a Galaxy S24', () => {
    const layout = layoutFor(360, 780, 1.3);
    expect(layout.compact).toBe(true);
    expect(layout.gutter).toBe(COMPACT_GUTTER);
    expect(layout.textWidth).toBeCloseTo(276.9, 1);
    expect(layout.narrow).toBe(true);
  });

  it('treats a nonsense font scale as 1', () => {
    expect(layoutFor(400, 800, Number.NaN).fontScale).toBe(1);
    expect(layoutFor(400, 800, 0).fontScale).toBe(1);
  });

  it('never lets text scaling below 1 widen the layout', () => {
    expect(layoutFor(320, 640, 0.85).textWidth).toBe(320);
  });
});

describe('heroRingSize', () => {
  it.each([
    [320, 1],
    [360, 1],
    [360, 1.3],
    [393, 1],
    [412, 1],
    [600, 1],
  ])('fits three rings side by side at %idp (font scale %f)', (width, scale) => {
    const layout = layoutFor(width, 800, scale);
    const size = heroRingSize(layout);
    expect(size * 3 + 8 * 2).toBeLessThanOrEqual(width - layout.gutter * 2);
    expect(size).toBeLessThanOrEqual(104);
  });
});

describe('breaksMidWord', () => {
  it('accepts lines that break at spaces, with or without the trailing space', () => {
    expect(breaksMidWord('Log symptoms', ['Log ', 'symptoms'])).toBe(false);
    expect(breaksMidWord('Log symptoms', ['Log', 'symptoms'])).toBe(false);
    expect(breaksMidWord('Sleep planner & alarm', ['Sleep planner', '& alarm'])).toBe(false);
  });

  it('accepts a break after a hyphen or slash', () => {
    expect(breaksMidWord('Heart-rate', ['Heart-', 'rate'])).toBe(false);
    expect(breaksMidWord('in/out', ['in/', 'out'])).toBe(false);
  });

  it('spots a word split across two lines', () => {
    expect(breaksMidWord('Log symptoms', ['Log sym', 'ptoms'])).toBe(true);
    expect(breaksMidWord('Resting HR', ['RESTI', 'NG HR'])).toBe(true);
    expect(breaksMidWord('Sleep planner & alarm', ['Sleep ', 'plan', 'ner & alarm'])).toBe(true);
  });

  it('does not judge lines it cannot match to the text', () => {
    expect(breaksMidWord('Log symptoms', ['Log sy…'])).toBe(false);
    expect(breaksMidWord('Log symptoms', ['Other text', 'here'])).toBe(false);
  });

  it('treats one line as fine', () => {
    expect(breaksMidWord('Breathing', ['Breathing'])).toBe(false);
    expect(breaksMidWord('', [])).toBe(false);
  });
});

describe('fitFontSize', () => {
  it('follows the system text size while nothing breaks', () => {
    expect(fitFontSize(13, 1.3, 2, 1)).toBeCloseTo(16.9, 5);
    expect(fitFontSize(13, 2.5, 2, 1)).toBe(26);
    expect(fitFontSize(13, 2.5, 0, 1)).toBeCloseTo(32.5, 5);
  });

  it('never shrinks below the base size or below 11 dp', () => {
    expect(fitFontSize(13, 1.3, 2, 0.1)).toBe(13);
    expect(fitFontSize(10, 1.3, 2, 0.1)).toBe(11);
    expect(fitFontSize(11, 1.3, 1.4, 0.5)).toBe(11);
  });

  it('never grows a small system text size', () => {
    expect(fitFontSize(13, 0.85, 2, 1)).toBeCloseTo(11.05, 5);
    expect(fitFontSize(13, 0.85, 2, 0.5)).toBeCloseTo(11.05, 5);
  });
});

describe('fitArt', () => {
  it('fills the space that is left, between the limits', () => {
    expect(fitArt(150, 200, 96, 220)).toBe(150);
    expect(fitArt(400, 200, 96, 220)).toBe(220);
    expect(fitArt(40, 200, 96, 220)).toBe(96);
  });

  it('uses the fallback before the first layout', () => {
    expect(fitArt(null, 780 * 0.22, 96, 220)).toBe(172);
  });
});
