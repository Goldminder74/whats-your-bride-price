export const RETENTION_DAY = 86_400_000;
export const RETENTION_POLICY = Object.freeze({purgeDays:7, walletMinimisationDays:30, backupDays:30, supportMonths:12, disputeYears:6});
export function retentionTime(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 8_640_000_000_000_000) throw new Error("invalid_retention_time");
  return value;
}
export function calendarDeadline(time: number, months: number): number {
  const date = new Date(retentionTime(time));
  const day = date.getUTCDate(); date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth()+months);
  const last = new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
  date.setUTCDate(Math.min(day,last)); return retentionTime(date.getTime());
}
/** UK tax years end 5 April; keep through the fifth anniversary of the filing deadline. */
export function accountingDeadline(time: number): number {
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/London",year:"numeric",month:"numeric",day:"numeric"}).formatToParts(new Date(retentionTime(time)));
  const part=(name:string)=>Number(parts.find(value=>value.type===name)?.value);
  const year=part("year"),month=part("month"),day=part("day");
  const endYear=month>4 || (month===4 && day>=6) ? year+1 : year;
  return Date.UTC(endYear+6,1,1); // end of 31 January, not its beginning
}
export function caseDeadline(kind: string, closedAt: number): number {
  if (!["support","privacy","refund","dispute"].includes(kind)) throw new Error("invalid_retention_case");
  return calendarDeadline(closedAt,kind==="refund" || kind==="dispute" ? 72 : 12);
}
