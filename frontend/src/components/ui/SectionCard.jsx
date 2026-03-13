export default function SectionCard({ children, className = "" }) {
  return <section className={`ui-section-card ${className}`.trim()}>{children}</section>;
}
