"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { Icon } from "@/components/Icon";
import { Button, IconButton, TextField, Textarea } from "@/components/ui";
import { Switch } from "@/components/ui/Switch";
import { uploadCanvasAttachment } from "@/lib/upload";
import {
  copyMarketItemsToClasses,
  createMarketItem,
  deleteMarketItem,
  updateMarketItem,
  watchMarketItems,
  watchPurchases,
  type MarketItem,
  type Purchase,
} from "@/lib/market";
import {
  listMembers,
  listMyClasses,
  type ClassRoom,
  type Member,
} from "@/lib/classes";
import { resolveStudentName } from "@/lib/names";

/**
 * 교사 러닝마켓 관리 — [상품 관리] 탭에서 상품 등록/토글/삭제, [구매 내역] 탭에서 학생 구매 기록 열람.
 * 통화 단위는 "만보". 상품 이미지는 선택 사항(기존 업로드 헬퍼 재사용).
 */
export function MarketManageModal({
  cid,
  user,
  onClose,
}: {
  cid: string;
  user: User;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"items" | "purchases">("items");
  const [items, setItems] = useState<MarketItem[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [members, setMembers] = useState<Member[]>([]);

  useEffect(() => {
    listMembers(cid).then(setMembers).catch(() => {});
  }, [cid]);

  useEffect(() => {
    const off1 = watchMarketItems(cid, setItems);
    const off2 = watchPurchases(cid, setPurchases);
    return () => {
      off1();
      off2();
    };
  }, [cid]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(0,0,0,0.32)] p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-[var(--md-sys-color-surface-container-high)] shadow-[var(--md-sys-elevation-3)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--md-sys-color-outline-variant)] px-5 py-4">
          <Icon
            name="storefront"
            size={20}
            className="text-[var(--md-sys-color-primary)]"
          />
          <p className="text-lg font-semibold">러닝마켓 관리</p>
          <button
            onClick={onClose}
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)]"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* 탭 */}
        <div className="flex gap-1.5 px-5 pt-4">
          {(
            [
              ["items", `상품 관리 ${items.length}`],
              ["purchases", `구매 내역 ${purchases.length}`],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold transition ${
                tab === k
                  ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                  : "border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface-variant)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "items" ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
            <AddItemForm cid={cid} user={user} />
            {items.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
                아직 등록한 상품이 없어요. 위에서 첫 상품을 추가하세요.
              </p>
            ) : (
              <>
                <CopyToClassesPanel cid={cid} user={user} items={items} />
                <ul className="flex flex-col gap-2.5">
                  {items.map((it) => (
                    <ItemRow key={it.id} cid={cid} item={it} />
                  ))}
                </ul>
              </>
            )}
          </div>
        ) : purchases.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
            아직 구매 내역이 없어요.
          </p>
        ) : (
          <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-5">
            {purchases.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-2xl bg-[var(--md-sys-color-surface-container)] px-4 py-3"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]">
                  <Icon name="shopping_bag" size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    <span className="font-bold">
                      {resolveStudentName(members, p.buyerUid, p.buyerName)}
                    </span>
                    <span className="text-[var(--md-sys-color-on-surface-variant)]">
                      {" 님이 "}
                    </span>
                    <span className="font-bold">{p.title}</span>
                  </p>
                  <p className="text-xs text-black/55">{fmtTime(p.at)}</p>
                </div>
                <span className="shrink-0 rounded-full bg-[var(--md-sys-color-tertiary-container)] px-2.5 py-1 text-xs font-bold text-[var(--md-sys-color-on-tertiary-container)]">
                  {p.price.toLocaleString()} 만보
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function fmtTime(at: number | null) {
  if (!at) return "방금";
  return new Date(at).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------- 상품 추가 폼 ----------
function AddItemForm({ cid, user }: { cid: string; user: User }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState(10);
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const valid = title.trim().length > 0 && price >= 0;

  async function onPickImage(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    setErr("");
    setUploading(true);
    try {
      const att = await uploadCanvasAttachment({
        cid,
        uid: user.uid,
        type: "image",
        data: f,
        name: f.name,
      });
      setImageUrl(att.url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "이미지 업로드에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setErr("");
    try {
      await createMarketItem(
        cid,
        { title: title.trim(), description: description.trim(), price, imageUrl },
        user
      );
      setTitle("");
      setDescription("");
      setPrice(10);
      setImageUrl("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setErr(e instanceof Error ? e.message : "상품 등록에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-[var(--md-sys-color-surface-container)] p-4">
      <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--md-sys-color-on-surface)]">
        <Icon
          name="add"
          size={18}
          className="text-[var(--md-sys-color-primary)]"
        />
        상품 추가
      </p>
      <TextField
        label="상품명"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="예: 자리 바꾸기 쿠폰"
        uiSize="md"
        maxLength={40}
      />
      <Textarea
        label="설명 (선택)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="상품 설명을 입력하세요"
        rows={2}
        maxLength={120}
      />
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-32">
          <TextField
            label="가격 (만보)"
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(Math.max(0, parseInt(e.target.value, 10) || 0))}
            uiSize="md"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="px-0.5 text-sm font-bold text-[var(--md-sys-color-on-surface-variant)]">
            이미지 (선택)
          </span>
          <div className="flex items-center gap-2">
            {imageUrl && (
              <span className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt=""
                  className="h-11 w-11 rounded-xl object-cover ring-1 ring-[var(--md-sys-color-outline-variant)]"
                />
                <button
                  type="button"
                  onClick={() => setImageUrl("")}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--md-sys-color-error)] text-white shadow"
                >
                  <Icon name="close" size={12} />
                </button>
              </span>
            )}
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="inline-flex h-11 items-center gap-1.5 rounded-full border border-[var(--md-sys-color-outline)] px-4 text-sm font-semibold text-[var(--md-sys-color-on-surface)] transition hover:bg-black/5 disabled:opacity-40"
            >
              <Icon
                name={uploading ? "progress_activity" : "image"}
                size={18}
                className={uploading ? "animate-spin" : ""}
              />
              {uploading ? "올리는 중…" : imageUrl ? "이미지 변경" : "이미지 추가"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                onPickImage(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        </div>
      </div>
      {err && (
        <p className="rounded-lg bg-[var(--md-sys-color-error-container)] px-3 py-1.5 text-xs text-[var(--md-sys-color-on-error-container)]">
          {err}
        </p>
      )}
      <Button
        variant="filled"
        size="md"
        icon="add"
        disabled={!valid || busy || uploading}
        onClick={submit}
      >
        {busy ? "등록 중…" : "상품 등록"}
      </Button>
    </div>
  );
}

// ---------- 다른 학급에 적용(복사) ----------
function CopyToClassesPanel({
  cid,
  user,
  items,
}: {
  cid: string;
  user: User;
  items: MarketItem[];
}) {
  const [open, setOpen] = useState(false);
  const [classes, setClasses] = useState<ClassRoom[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const [err, setErr] = useState("");

  const activeCount = items.filter((i) => i.active).length;

  useEffect(() => {
    if (!open) return;
    setErr("");
    listMyClasses(user.uid)
      .then((cs) => setClasses(cs.filter((c) => c.id !== cid)))
      .catch(() => setClasses([]));
  }, [open, user.uid, cid]);

  function toggle(id: string) {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function apply() {
    if (busy || picked.size === 0) return;
    setBusy(true);
    setErr("");
    setDone("");
    try {
      await copyMarketItemsToClasses(
        cid,
        [...picked],
        items.filter((i) => i.active),
        user
      );
      setDone(`${picked.size}개 학급에 적용했어요`);
      setPicked(new Set());
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "적용에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            setDone("");
          }}
          disabled={activeCount === 0}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--md-sys-color-outline)] px-4 py-2 text-sm font-semibold text-[var(--md-sys-color-on-surface)] transition hover:bg-black/5 disabled:opacity-40"
        >
          <Icon name="content_copy" size={16} />
          다른 학급에 적용
        </button>
        <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
          판매 중인 상품 {activeCount}개를 복사합니다
        </span>
        {done && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--md-sys-color-primary)]">
            <Icon name="check_circle" size={15} />
            {done}
          </span>
        )}
      </div>

      {open && (
        <div className="flex flex-col gap-2 rounded-xl bg-[var(--md-sys-color-surface)] p-3">
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
            복사 후에는 학급별로 독립 수정됩니다.
          </p>
          {classes === null ? (
            <p className="py-6 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
              불러오는 중…
            </p>
          ) : classes.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
              적용할 다른 학급이 없어요.
            </p>
          ) : (
            <ul className="flex max-h-52 flex-col gap-1.5 overflow-y-auto">
              {classes.map((c) => {
                const on = picked.has(c.id);
                return (
                  <li key={c.id}>
                    <label
                      className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition ${
                        on
                          ? "border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)]"
                          : "border-[var(--md-sys-color-outline-variant)] hover:bg-black/5"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(c.id)}
                        className="h-5 w-5 shrink-0 accent-[var(--md-sys-color-primary)]"
                      />
                      <span
                        className={`min-w-0 flex-1 truncate font-medium ${
                          on
                            ? "text-[var(--md-sys-color-on-primary-container)]"
                            : ""
                        }`}
                      >
                        {c.name || "(이름 없음)"}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {err && (
            <p className="rounded-lg bg-[var(--md-sys-color-error-container)] px-3 py-1.5 text-xs text-[var(--md-sys-color-on-error-container)]">
              {err}
            </p>
          )}
          {classes && classes.length > 0 && (
            <Button
              variant="filled"
              size="md"
              icon="content_copy"
              disabled={busy || picked.size === 0}
              onClick={apply}
            >
              {busy ? "적용 중…" : `${picked.size}개 학급에 적용`}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- 상품 행 ----------
function ItemRow({ cid, item }: { cid: string; item: MarketItem }) {
  const [busy, setBusy] = useState(false);

  async function toggleActive(next: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      await updateMarketItem(cid, item.id, { active: next });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`"${item.title}" 상품을 삭제할까요?`)) return;
    await deleteMarketItem(cid, item.id);
  }

  return (
    <li className="flex items-center gap-3 rounded-2xl bg-[var(--md-sys-color-surface-container)] p-3">
      {item.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.imageUrl}
          alt=""
          className="h-14 w-14 shrink-0 rounded-xl object-cover ring-1 ring-[var(--md-sys-color-outline-variant)]"
        />
      ) : (
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)]">
          <Icon name="image" size={22} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5 font-bold">
          <span className="truncate">{item.title}</span>
          <span className="shrink-0 rounded-full bg-[var(--md-sys-color-tertiary-container)] px-2 py-0.5 text-xs font-extrabold text-[var(--md-sys-color-on-tertiary-container)]">
            {item.price.toLocaleString()} 만보
          </span>
        </p>
        {item.description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-black/55">
            {item.description}
          </p>
        )}
        {!item.active && (
          <p className="mt-0.5 text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">
            숨김 (학생에게 보이지 않음)
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Switch
          checked={item.active}
          onChange={toggleActive}
          disabled={busy}
          label="판매"
        />
        <IconButton
          icon="delete"
          label="상품 삭제"
          size="md"
          variant="danger"
          onClick={remove}
        />
      </div>
    </li>
  );
}
