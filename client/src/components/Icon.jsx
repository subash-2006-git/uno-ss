// Small inline SVG icon set (replaces emoji so icons look the same on every device and scale cleanly).
const PATHS = {
  crown: <path d="M3 18h18l-1.6-10-4.4 4-3-6.5-3 6.5-4.4-4z" fill="currentColor" />,
  sliders: (
    <>
      <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
      <circle cx="15" cy="6" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="17" cy="18" r="2" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 4h8v6a4 4 0 0 1-8 0z" fill="currentColor" />
      <path d="M8 6H4v1.5A3.5 3.5 0 0 0 8 11M16 6h4v1.5A3.5 3.5 0 0 1 16 11M12 14v4M8 20h8" />
    </>
  ),
  skip: (<><circle cx="12" cy="12" r="8" /><path d="M6.3 6.3l11.4 11.4" /></>),
  reverse: <path d="M4 8h13M14 5l3 3-3 3M20 16H7M10 13l-3 3 3 3" />,
  star: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" fill="currentColor" />,
  clock: (<><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></>),
  copy: (<><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></>),
  logout: <path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9" />,
  eye: (<><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>),
  chat: <path d="M4 5h16v11H10l-6 4z" />,
  send: <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />,
  smile: (<><circle cx="12" cy="12" r="9" /><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" /></>),
  chart: <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  users: (<><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5a3 3 0 0 1 0 6M18 14c2 .8 3 2.7 3 6" /></>),
};

export default function Icon({ name, size = 18, className = '' }) {
  return (
    <svg className={`icon ${className}`} viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
