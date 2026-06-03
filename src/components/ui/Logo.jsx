// Uses the real VRXE logo image (public/vrxe-logo.png)
// variant: 'full' = logo + text, 'icon' = just the image
export default function Logo({ size = 'md', className = '' }) {
  const sizes = {
    xs:  'h-7',
    sm:  'h-9',
    md:  'h-12',
    lg:  'h-16',
    xl:  'h-24',
  }
  return (
    <img
      src="/vrxe-logo.png"
      alt="VRXE Game Esports Events"
      className={`${sizes[size] || sizes.md} w-auto object-contain ${className}`}
    />
  )
}
