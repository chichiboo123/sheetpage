interface IconProps {
  name: string
  className?: string
}

/** Material Symbols glyph. Decorative by default — labels live on the control. */
export function Icon({ name, className = '' }: IconProps) {
  return (
    <span className={`icon select-none ${className}`} aria-hidden="true">
      {name}
    </span>
  )
}
