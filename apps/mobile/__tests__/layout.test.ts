import { COMPACT_GUTTER, GUTTER, heroRingSize, layoutFor } from '@/ui/layout';

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
