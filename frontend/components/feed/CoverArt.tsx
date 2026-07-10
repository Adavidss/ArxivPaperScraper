// Deterministic cover art for papers without an extractable figure: soft
// aurora gradients seeded by paper id, hued by arXiv category. Content stays
// colorful even in the mono themes — color photos in a black-and-white
// magazine — while the chrome around it keeps the theme.

const hashCode = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

/** Stable hue per top-level arXiv archive (quant-ph, cs, cond-mat, …). */
export const categoryHue = (category: string): number =>
  (hashCode(category.split(".")[0]) * 47) % 360;

export function CoverArt({
  seed,
  category,
  className,
}: {
  seed: string;
  category: string;
  className?: string;
}) {
  const hue = categoryHue(category);
  const hue2 = (hue + 55) % 360;
  const hue3 = (hue + 200) % 360;
  const p = hashCode(seed);
  const x1 = 15 + (p % 55);
  const y1 = 20 + ((p >> 2) % 45);
  const x2 = 45 + ((p >> 4) % 45);
  const y2 = 10 + ((p >> 6) % 60);
  const x3 = 10 + ((p >> 8) % 70);
  const y3 = 55 + ((p >> 10) % 35);

  return (
    <div
      aria-hidden
      className={`relative overflow-hidden ${className ?? ""}`}
      style={{
        background: `radial-gradient(60% 80% at ${x1}% ${y1}%, hsl(${hue} 75% 58% / 0.9), transparent 65%),
radial-gradient(55% 70% at ${x2}% ${y2}%, hsl(${hue2} 70% 52% / 0.75), transparent 60%),
radial-gradient(75% 70% at ${x3}% ${y3}%, hsl(${hue3} 60% 45% / 0.5), transparent 65%),
linear-gradient(155deg, hsl(${hue} 45% 15%), hsl(${hue2} 50% 8%))`,
      }}
    >
      <span className="absolute bottom-2 left-3 font-mono text-2xl font-bold lowercase tracking-tight text-white/25">
        {category}
      </span>
    </div>
  );
}
