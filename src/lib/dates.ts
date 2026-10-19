// 날짜는 모두 로컬 기준 'YYYY-MM-DD' 문자열로 다룬다.
const pad = (n: number) => String(n).padStart(2, "0");

export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const today = () => ymd(new Date());
export const addDays = (s: string, n: number) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
};
/** 그 주의 월요일 */
export const mondayOf = (s: string) => {
  const d = parse(s);
  const w = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - w);
  return ymd(d);
};
export const weekDays = (s: string) => Array.from({ length: 7 }, (_, i) => addDays(mondayOf(s), i));
export const md = (s: string) => {
  const d = parse(s);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};
export const WD = ["일", "월", "화", "수", "목", "금", "토"];
export const weekday = (s: string) => WD[parse(s).getDay()];
export const diffDays = (a: string, b: string) => Math.round((parse(a).getTime() - parse(b).getTime()) / 864e5);
/** 마감까지 남은 날: D-3, D-day, D+2 */
export const dday = (due: string, base: string = today()) => {
  const n = diffDays(due, base);
  return n === 0 ? "D-day" : n > 0 ? `D-${n}` : `D+${-n}`;
};
export const dayOfYear = (s: string) => {
  const d = parse(s);
  return diffDays(s, `${d.getFullYear()}-01-01`) + 1;
};
export const daysLeftInYear = (s: string) => diffDays(`${parse(s).getFullYear()}-12-31`, s);
export const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : "");
