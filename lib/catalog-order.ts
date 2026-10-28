export function prioritizeCurrentCatalogItems<T extends { applicationDeadline: Date | string | null }>(
  items: T[],
  now: Date = new Date(),
): T[] {
  const current: T[] = [];
  const expired: T[] = [];
  for (const item of items) {
    const deadline = item.applicationDeadline ? new Date(item.applicationDeadline) : null;
    if (deadline && !Number.isNaN(deadline.getTime()) && deadline <= now) expired.push(item);
    else current.push(item);
  }
  return [...current, ...expired];
}
