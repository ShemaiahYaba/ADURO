import type { Emotion } from "@/lib/types";

const ORB_STYLES: Record<Emotion, string> = {
  sadness: "from-[#5b7aa8] to-[#3d5a80]",
  anger: "from-[#c45c5c] to-[#8b3a3a]",
  anxiety: "from-[#9b7bb8] to-[#6b4f8a]",
  stress: "from-[#c49a5c] to-[#8a6b3a]",
  support: "from-[#5cb8a8] to-[#3a8a7a]",
  neutral: "from-[#6b9bd1] to-[#4a6fa5]",
  crisis: "from-[#e05050] to-[#a03030]",
  factual: "from-[#5ca8c4] to-[#3a7a8a]",
  off_topic: "from-[#6b7280] to-[#4b5563]",
  happy: "from-[#5cb87a] to-[#3a8a5a]",
  grief: "from-[#7a6b9b] to-[#5a4a7a]",
};

type EmotionOrbProps = {
  emotion: Emotion;
};

export function EmotionOrb({ emotion }: EmotionOrbProps) {
  const gradient = ORB_STYLES[emotion] ?? ORB_STYLES.neutral;

  return (
    <div
      className={`h-14 w-14 rounded-full bg-gradient-to-br ${gradient} orb-pulse shadow-lg shadow-black/30`}
      role="img"
      aria-label={`Emotion indicator: ${emotion}`}
    />
  );
}
