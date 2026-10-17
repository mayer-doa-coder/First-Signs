import type { SVGProps } from "react";

export type IconName =
  | "arrow"
  | "building"
  | "care"
  | "check"
  | "clock"
  | "community"
  | "dashboard"
  | "document"
  | "home"
  | "info"
  | "location"
  | "microphone"
  | "pause"
  | "pharmacy"
  | "play"
  | "screen"
  | "search"
  | "shield"
  | "stop"
  | "trend"
  | "upload"
  | "users";

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...props,
  };

  const paths: Record<IconName, React.ReactNode> = {
    arrow: <><path d="M5 12h14" /><path d="m14 7 5 5-5 5" /></>,
    building: <><path d="M4 21h16" /><path d="M6 21V5l6-2 6 2v16" /><path d="M9 9h6M9 13h6M9 17h6" /></>,
    care: <><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" /><path d="M8 12h2l1-2 2 4 1-2h2" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    community: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
    document: <><path d="M6 2h8l4 4v16H6z" /><path d="M14 2v5h5M9 13h6M9 17h4" /></>,
    home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v11h14V10M9 21v-7h6v7" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
    location: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    microphone: <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" /></>,
    pause: <><path d="M9 5v14" /><path d="M15 5v14" /></>,
    pharmacy: <><path d="M4 8h16l-1-4H5L4 8Z" /><path d="M5 8v12h14V8M9 20v-6h6v6" /><path d="M10 11h4M12 9v4" /></>,
    play: <path d="m8 5 11 7-11 7Z" />,
    screen: <><path d="M9 4h6" /><rect x="5" y="2" width="14" height="20" rx="3" /><path d="M9 17h6M9 13h2" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></>,
    stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
    trend: <><path d="M3 3v18h18" /><path d="m7 16 4-5 3 3 5-7" /></>,
    upload: <><path d="M12 16V3M7 8l5-5 5 5" /><path d="M5 14v6h14v-6" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M15.5 3.13a4 4 0 0 1 0 7.75" /></>,
  };

  return <svg {...common}>{paths[name]}</svg>;
}
