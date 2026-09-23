/**
 * Link to an original source. Always opens a new tab so the explorer (and its
 * in-memory results) stays where it is.
 */
export default function ExternalLink({ href, children, className, title }) {
  if (!href) return null;
  const open = (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return; // let the browser handle modified clicks
    e.preventDefault();
    // Never navigate the explorer tab itself; a user click is not popup-blocked.
    const w = window.open(href, '_blank');
    if (w) w.opener = null;
  };
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={open} className={className} title={title}>
      {children}
    </a>
  );
}
