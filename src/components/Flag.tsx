/* eslint-disable @next/next/no-img-element */
import { flagCodeFor } from "@/lib/countries";

interface Props {
  teamName: string | null | undefined;
  /** Display width in px. Falls back to null when the name has no flag. */
  size?: number;
  className?: string;
}

/** Inline country flag from FlagCDN. Renders nothing if the team is unknown
 *  (e.g. knockout placeholders like "2A" or "W101"). */
export function Flag({ teamName, size = 20, className = "" }: Props) {
  const code = flagCodeFor(teamName);
  if (!code) return null;

  // FlagCDN's discrete width buckets — pick the smallest one that's at least 2x for retina.
  const buckets = [20, 40, 80, 160];
  const wantedWidth = size * 2;
  const bucket = buckets.find((b) => b >= wantedWidth) ?? 160;
  const src1x = `https://flagcdn.com/w${bucket / 2}/${code}.png`;
  const src2x = `https://flagcdn.com/w${bucket}/${code}.png`;

  return (
    <img
      src={src1x}
      srcSet={`${src1x} 1x, ${src2x} 2x`}
      width={size}
      height={Math.round(size * 0.75)}
      alt=""
      aria-hidden="true"
      loading="lazy"
      className={`inline-block rounded-[2px] ring-1 ring-black/10 dark:ring-white/10 ${className}`}
    />
  );
}
