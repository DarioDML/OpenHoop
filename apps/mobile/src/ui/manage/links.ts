export const REPO_URL = 'https://github.com/DarioDML/OpenHoop';

export const SPONSORS_URL = 'https://github.com/sponsors/DarioDML';

export const DONATION_AMOUNTS_USD = [3, 5, 10] as const;

export const MAX_DONATION_USD = 12000;

export type DonationFrequency = 'one-time' | 'monthly';

export function donationUrl(frequency: DonationFrequency, amountUsd: number): string {
  const githubFrequency = frequency === 'monthly' ? 'recurring' : 'one-time';
  return `${SPONSORS_URL}/sponsorships?preview=false&frequency=${githubFrequency}&amount=${amountUsd}`;
}

export function parseDonationAmount(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,5}$/.test(trimmed)) return null;
  const amount = Number(trimmed);
  return amount >= 1 && amount <= MAX_DONATION_USD ? amount : null;
}
