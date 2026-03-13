export default function Button({ as = "button", variant = "primary", className = "", ...props }) {
  const Tag = as;
  return <Tag className={`ui-btn ui-btn-${variant} ${className}`.trim()} {...props} />;
}
