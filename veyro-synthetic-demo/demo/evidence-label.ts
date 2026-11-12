export function evidenceStatusLabel(status: string) {
  const labels: Record<string, string> = { verified_numeric: 'Synthetic input checked', verified_zero: 'Synthetic zero checked',
    unavailable_source: 'Supporting input unavailable', unsupported_reporting_basis: 'Reporting basis unsupported',
    incompatible_period: 'Period or currency mismatch', not_applicable: 'Not applicable' };
  return labels[status] ?? status.replaceAll('_', ' ');
}
