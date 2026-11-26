import type { DonationResult } from '@openhoop/core';
import { modelLabel } from '@openhoop/core/donation-info';

import { REPO_URL } from '@/ui/manage/links';

export const DONATION_TEMPLATE = 'data-donation.yml';

function modelsText(result: DonationResult): string {
  return [...new Set(result.models.map(modelLabel))].join(' + ');
}

export function donationIssueTitle(result: DonationResult): string {
  const count = result.days.length;
  const span = count === 1 ? result.firstDay : `${result.firstDay} to ${result.lastDay}`;
  return `Data donation: ${modelsText(result)} · ${count} ${count === 1 ? 'day' : 'days'} · ${span}`;
}

export function donationIssueSummary(result: DonationResult, appVersion: string): string {
  return [
    `Band: ${modelsText(result)}`,
    `Donation code: ${result.code}`,
    `Files: ${result.parts.length}`,
    `Firmware: ${result.firmware.join(', ')}`,
    `App: OpenHoop ${appVersion}`,
    `Official values: ${result.officialDays.length} of ${result.days.length} days`,
  ].join('\n');
}

export function donationIssueUrl(result: DonationResult, appVersion: string): string {
  const title = encodeURIComponent(donationIssueTitle(result));
  const summary = encodeURIComponent(donationIssueSummary(result, appVersion));
  return `${REPO_URL}/issues/new?template=${DONATION_TEMPLATE}&title=${title}&summary=${summary}`;
}
