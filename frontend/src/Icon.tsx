export function IconSprite() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="svg-sprite" aria-hidden="true">
      <symbol id="i-grid" viewBox="0 0 24 24">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </symbol>
      <symbol id="i-users" viewBox="0 0 24 24">
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20v-1a6 6 0 0 1 12 0v1M17 5a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 5v1" />
      </symbol>
      <symbol id="i-user" viewBox="0 0 24 24">
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20v-1a7 7 0 0 1 14 0v1" />
      </symbol>
      <symbol id="i-box" viewBox="0 0 24 24">
        <path d="m3 7 9-4 9 4-9 4-9-4Zm0 0v10l9 4 9-4V7M12 11v10" />
      </symbol>
      <symbol id="i-calendar" viewBox="0 0 24 24">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M7 3v4m10-4v4M3 10h18" />
      </symbol>
      <symbol id="i-receipt" viewBox="0 0 24 24">
        <path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3Zm4 5h6M9 12h6" />
      </symbol>
      <symbol id="i-chart" viewBox="0 0 24 24">
        <path d="M3 20h18M5 16l5-6 4 3 5-8" />
        <circle cx="5" cy="16" r="1" />
        <circle cx="10" cy="10" r="1" />
        <circle cx="14" cy="13" r="1" />
        <circle cx="19" cy="5" r="1" />
      </symbol>
      <symbol id="i-settings" viewBox="0 0 24 24">
        <path d="M4 6h16M4 12h16M4 18h16" />
        <circle cx="9" cy="6" r="2" />
        <circle cx="16" cy="12" r="2" />
        <circle cx="11" cy="18" r="2" />
      </symbol>
      <symbol id="i-arrow" viewBox="0 0 24 24">
        <path d="M5 12h14m-6-6 6 6-6 6" />
      </symbol>
      <symbol id="i-menu" viewBox="0 0 24 24">
        <path d="M4 7h16M4 12h16M4 17h16" />
      </symbol>
      <symbol id="i-close" viewBox="0 0 24 24">
        <path d="M5 5l14 14M19 5 5 19" />
      </symbol>
      <symbol id="i-search" viewBox="0 0 24 24">
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m15.5 15.5 5 5" />
      </symbol>
      <symbol id="i-chevron" viewBox="0 0 24 24">
        <path d="m9 6 6 6-6 6" />
      </symbol>
      <symbol id="i-check" viewBox="0 0 24 24">
        <path d="m4 12 5 5L20 6" />
      </symbol>
      <symbol id="i-info" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5m0-8h.01" />
      </symbol>
      <symbol id="i-repeat" viewBox="0 0 24 24">
        <path d="M4 8a6 6 0 0 1 6-4h8l2 2-2 2m2 8a6 6 0 0 1-6 4H6l-2-2 2-2" />
        <path d="M18 8H6m0 8h12" />
      </symbol>
      <symbol id="i-card" viewBox="0 0 24 24">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 10h18m-13 5h4" />
      </symbol>
      <symbol id="i-file" viewBox="0 0 24 24">
        <path d="M6 3h8l4 4v14H6V3Zm8 0v5h4M9 12h6m-6 4h6" />
      </symbol>
      <symbol id="i-tag" viewBox="0 0 24 24">
        <path d="M3 12V4h8l10 10-7 7L3 12Z" />
        <circle cx="8" cy="8" r="1" />
      </symbol>
      <symbol id="i-percent" viewBox="0 0 24 24">
        <path d="M5 19 19 5" />
        <circle cx="7" cy="7" r="2" />
        <circle cx="17" cy="17" r="2" />
      </symbol>
      <symbol id="i-login" viewBox="0 0 24 24">
        <path d="M12 4h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-7M3 12h13m-4-4 4 4-4 4" />
      </symbol>
    </svg>
  );
}

export function Icon({ name }: { name: string }) {
  return (
    <svg aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}
