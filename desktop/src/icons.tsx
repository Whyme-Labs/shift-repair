import type { SVGProps } from "react";

type IconName = "repair" | "check" | "alert" | "arrow" | "download" | "upload" | "undo" | "refresh" | "lock" | "unlock" | "plus" | "close" | "calendar" | "people" | "clock" | "chevron";
const paths: Record<IconName, React.ReactNode> = {
  repair: <><path d="m14 5 5 5M4 20l9-9M14 5l2-2 5 5-2 2M3 13v-3M1.5 11.5h3M11 3V1M10 2h2M19 18v4M17 20h4" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  alert: <><path d="m10.3 4.2-8 14A1.2 1.2 0 0 0 3.4 20h17.2a1.2 1.2 0 0 0 1-1.8l-8-14a1.9 1.9 0 0 0-3.3 0Z" /><path d="M12 9v4m0 3v.01" /></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  download: <><path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5" /></>,
  upload: <><path d="M12 16V4m-4 4 4-4 4 4M4 16v5h16v-5" /></>,
  undo: <><path d="M9 5 4 10l5 5M4 10h10a6 6 0 0 1 0 12" /></>,
  refresh: <><path d="M20 7V3l-3 3a8 8 0 1 0 3 9M20 7h-5" /></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3" /></>,
  unlock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V6a4 4 0 0 1 7-2M12 14v3" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 10h18M8 14h1m6 0h1M8 17h1" /></>,
  people: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 5a5 5 0 0 1 3 5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  chevron: <path d="m9 5 7 7-7 7" />,
};

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
