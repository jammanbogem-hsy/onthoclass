import { type Member } from "@/lib/classes";

/**
 * 학생/멤버 프로필 아바타 — 사진이 있으면 원형 이미지, 없으면 이름 첫 글자.
 * 교사 콘솔의 학생 카드와 학생 화면의 친구 카드가 동일한 UI 를 쓰도록 공용화.
 */
export function Avatar({
  m,
  name,
  size = 44,
}: {
  m: Member | undefined;
  name: string;
  size?: number;
}) {
  if (m?.photoURL) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={m.photoURL}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  const label = (m?.displayName || name || "?").slice(0, 1);
  return (
    <span
      className="flex items-center justify-center rounded-full bg-[var(--md-sys-color-primary-container)] font-bold text-[var(--md-sys-color-on-primary-container)]"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {label}
    </span>
  );
}
