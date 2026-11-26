export const REPO_URL = 'https://github.com/DarioDML/OpenHoop';

export const SPONSORS_URL = 'https://github.com/sponsors/DarioDML';

export const DONATION_AMOUNTS_USD = [3, 5, 10] as const;

export type DonationFrequency = 'one-time' | 'monthly';

export function donationUrl(frequency: DonationFrequency, amountUsd: number | null): string {
  const githubFrequency = frequency === 'monthly' ? 'recurring' : 'one-time';
  if (amountUsd === null) return `${SPONSORS_URL}?frequency=${githubFrequency}`;
  return `${SPONSORS_URL}/sponsorships?preview=false&frequency=${githubFrequency}&amount=${amountUsd}`;
}
