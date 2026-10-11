export type PortalIconName =
  | 'home'
  | 'dashboard'
  | 'weather'
  | 'assistant'
  | 'notifications'
  | 'profile'
  | 'plant'
  | 'rain'
  | 'history'
  | 'map'
  | 'sound'
  | 'info'
  | 'arrow'
  | 'stop'
  | 'lock'

const iconPaths: Record<PortalIconName, string> = {
  home: 'm3 10 9-7 9 7v10a1 1 0 0 1-1 1h-6v-7h-4v7H4a1 1 0 0 1-1-1Z',
  dashboard: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  weather: 'M7 16a4 4 0 1 1 1-7.87A5 5 0 0 1 18 10a3 3 0 1 1 0 6H7Zm2 3-1 2m6-2-1 2m6-2-1 2',
  assistant: 'M20 11.5a7.5 7.5 0 0 1-7.5 7.5H7l-4 2v-6.5A7.5 7.5 0 1 1 20 11.5ZM8 10h8m-8 4h5',
  notifications: 'M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-8 12h4',
  profile: 'M20 21a8 8 0 0 0-16 0m12-14a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  plant: 'M12 21V10m0 5C6 15 4 11 4 6c5 0 8 2 8 7m0 1c0-6 4-9 9-9 0 6-3 10-9 10',
  rain: 'M6 15a4 4 0 1 1 1-7.87A5 5 0 0 1 17 9a3 3 0 1 1 0 6H6Zm2 3-1 3m6-3-1 3m6-3-1 3',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5m4-1v5l4 2',
  map: 'M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Zm-5 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  sound: 'M4 10v4h4l5 4V6l-5 4H4Zm12-1a4 4 0 0 1 0 6m2-9a7 7 0 0 1 0 12',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-11v6m0-10h.01',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  stop: 'M7 7h10v10H7z',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 1 1 8 0v4',
}

export default function PortalIcon({
  name,
  size = 20,
  className,
}: {
  name: PortalIconName
  size?: number
  className?: string
}) {
  return (
    <svg
      className={`portal-icon${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={iconPaths[name]} />
    </svg>
  )
}
