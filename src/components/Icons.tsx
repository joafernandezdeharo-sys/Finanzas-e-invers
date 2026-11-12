import type { SVGProps } from 'react';

const base = (d: string | string[]) => (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
    {(Array.isArray(d) ? d : [d]).map((x, i) => <path key={i} d={x} />)}
  </svg>
);

export const IconHome = base(['M3 10.5 12 3l9 7.5', 'M5 9.5V21h14V9.5']);
export const IconList = base(['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01']);
export const IconPiggy = base(['M19 10c0-3.3-3.1-6-7-6s-7 2.7-7 6c0 1.9 1 3.6 2.6 4.7L8 19h3l.5-2h1l.5 2h3l.5-3.5c1.4-.8 2.5-2 2.5-3.5h1v-3h-1Z', 'M15 9h.01']);
export const IconDollar = base(['M12 2v20', 'M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6']);
export const IconChart = base(['M3 3v18h18', 'm7 15 4-4 3 3 5-6']);
export const IconNews = base(['M4 4h13v16H6a2 2 0 0 1-2-2V4Z', 'M17 8h3v10a2 2 0 0 1-2 2', 'M8 8h5', 'M8 12h5', 'M8 16h3']);
export const IconSettings = base(['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z']);
export const IconPlus = base(['M12 5v14', 'M5 12h14']);
export const IconEdit = base(['M12 20h9', 'M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z']);
export const IconTrash = base(['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6']);
export const IconRefresh = base(['M21 12a9 9 0 1 1-2.6-6.4L21 8', 'M21 3v5h-5']);
export const IconMenu = base(['M4 6h16', 'M4 12h16', 'M4 18h16']);
export const IconX = base(['M18 6 6 18', 'm6 6 12 12']);
export const IconChevronL = base('m15 18-6-6 6-6');
export const IconChevronR = base('m9 18 6-6-6-6');
export const IconDownload = base(['M12 3v12', 'm7 10 5 5 5-5', 'M5 21h14']);
export const IconUpload = base(['M12 21V9', 'm7 14 5-5 5 5', 'M5 3h14']);
export const IconExternal = base(['M15 3h6v6', 'M10 14 21 3', 'M21 14v7H3V3h7']);
export const IconHistory = base(['M3 12a9 9 0 1 0 3-6.7L3 8', 'M3 3v5h5', 'M12 7v5l3 2']);
export const IconGlobe = base(['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M3 12h18', 'M12 3a14 14 0 0 1 0 18', 'M12 3a14 14 0 0 0 0 18']);
export const IconInfo = base(['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 16v-4', 'M12 8h.01']);
export const IconWallet = base(['M3 7a2 2 0 0 1 2-2h13v4', 'M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2Z', 'M16 14h.01']);
export const IconTarget = base(['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z', 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z']);
export const IconBell = base(['M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10.3 21a1.9 1.9 0 0 0 3.4 0']);
export const IconLock = base(['M5 11h14v10H5z', 'M8 11V7a4 4 0 1 1 8 0v4']);
export const IconCloud = base(['M17.5 19a4.5 4.5 0 1 0-1.4-8.8A6 6 0 1 0 6 17.5', 'M6 19h11.5']);
