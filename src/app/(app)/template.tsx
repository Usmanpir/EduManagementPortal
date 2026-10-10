/** Each section fades in on navigation (templates remount per top-level segment). */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-enter">{children}</div>;
}
