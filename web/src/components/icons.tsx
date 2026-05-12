type IconProps = { className?: string };

function Svg({
  children,
  className = "w-5 h-5",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const PlusIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const XIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M18 6L6 18M6 6l12 12" />
  </Svg>
);

export const TrashIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <Svg className={className}>
    <path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </Svg>
);

export const ChevronUpIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <Svg className={className}>
    <path d="M18 15l-6-6-6 6" />
  </Svg>
);

export const ChevronDownIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <Svg className={className}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
);

export const ChevronRightIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <Svg className={className}>
    <path d="M9 18l6-6-6-6" />
  </Svg>
);

export const ChevronLeftIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <Svg className={className}>
    <path d="M15 18l-6-6 6-6" />
  </Svg>
);

export const PencilIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <Svg className={className}>
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </Svg>
);

export const ListIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </Svg>
);

export const CalendarIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </Svg>
);

export const BarChartIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <line x1="12" y1="20" x2="12" y2="10" />
    <line x1="18" y1="20" x2="18" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </Svg>
);

export const LogOutIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
  </Svg>
);

export const SearchIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </Svg>
);

export const CheckIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <Svg className={className}>
    <polyline points="20 6 9 17 4 12" />
  </Svg>
);

export const GripIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <svg viewBox="0 0 10 16" fill="currentColor" className={className} aria-hidden="true">
    <circle cx="3" cy="4"  r="1.2" />
    <circle cx="7" cy="4"  r="1.2" />
    <circle cx="3" cy="8"  r="1.2" />
    <circle cx="7" cy="8"  r="1.2" />
    <circle cx="3" cy="12" r="1.2" />
    <circle cx="7" cy="12" r="1.2" />
  </svg>
);
