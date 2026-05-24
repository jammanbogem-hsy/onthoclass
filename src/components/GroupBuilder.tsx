"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Icon } from "@/components/Icon";
import { useDialog } from "@/components/Dialog";
import type { Member } from "@/lib/classes";
import {
  createGroup,
  deleteGroup,
  listGroups,
  updateGroup,
  type Group,
} from "@/lib/groups";

/** 모둠 편성 — 드래그앤드롭(+ 폴백) 으로 학생 배치 */
export function GroupBuilder({
  cid,
  members,
}: {
  cid: string;
  members: Member[];
}) {
  const { user } = useAuth();
  const dialog = useDialog();
  const students = members.filter((m) => m.role === "student");
  const [groups, setGroups] = useState<Group[]>([]);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  /** 드래그 중 마우스가 올라가 있는 드롭 영역 (null=미배정, ""=없음) */
  const [dragOver, setDragOver] = useState<string | "unassigned" | null>(null);
  const [dragging, setDragging] = useState(false);

  const reload = useCallback(() => {
    listGroups(cid).then(setGroups).catch(() => {});
  }, [cid]);
  useEffect(() => {
    reload();
  }, [reload]);

  const nameOf = (uid: string) =>
    students.find((s) => s.uid === uid)?.displayName ?? uid;
  const groupOf = (uid: string) =>
    groups.find((g) => g.memberUids.includes(uid));
  const unassigned = students.filter((s) => !groupOf(s.uid));

  async function move(uid: string, toGid: string | null) {
    setBusy(true);
    try {
      await Promise.all(
        groups
          .filter((g) => g.memberUids.includes(uid) && g.id !== toGid)
          .map((g) =>
            updateGroup(cid, g.id, {
              memberUids: g.memberUids.filter((x) => x !== uid),
            })
          )
      );
      if (toGid) {
        const g = groups.find((x) => x.id === toGid);
        if (g && !g.memberUids.includes(uid))
          await updateGroup(cid, toGid, {
            memberUids: [...g.memberUids, uid],
          });
      }
      reload();
    } finally {
      setBusy(false);
    }
  }

  async function addGroup() {
    if (!user) return;
    await createGroup(cid, user, newName || `모둠 ${groups.length + 1}`);
    setNewName("");
    reload();
  }

  function onDrop(e: React.DragEvent, gid: string | null) {
    e.preventDefault();
    setDragOver(null);
    setDragging(false);
    const uid = e.dataTransfer.getData("text/uid");
    if (uid) move(uid, gid);
  }

  const Chip = ({ uid }: { uid: string }) => (
    <span
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/uid", uid);
        setDragging(true);
      }}
      onDragEnd={() => {
        setDragging(false);
        setDragOver(null);
      }}
      className="inline-flex cursor-grab items-center gap-1.5 rounded-full border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-highest)] px-3.5 py-2 text-sm font-semibold shadow-sm transition hover:shadow active:cursor-grabbing"
    >
      <Icon name="drag_indicator" size={16} className="opacity-50" />
      {nameOf(uid)}
    </span>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <input
          className="m3-field !py-2 !text-sm flex-1"
          placeholder="새 모둠 이름"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) addGroup();
          }}
        />
        <button
          onClick={addGroup}
          className="btn-accent rounded-full px-4 text-sm font-semibold"
        >
          모둠 추가
        </button>
      </div>

      {/* 미배정 학생 */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver("unassigned");
        }}
        onDragLeave={() => setDragOver((v) => (v === "unassigned" ? null : v))}
        onDrop={(e) => onDrop(e, null)}
        className={`rounded-2xl border-2 border-dashed p-4 transition ${
          dragOver === "unassigned"
            ? "border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)]/40"
            : "border-[var(--md-sys-color-outline-variant)]"
        }`}
      >
        <p className="mb-3 text-sm font-bold text-[var(--md-sys-color-on-surface-variant)]">
          미배정 ({unassigned.length}) — 끌어서 모둠에 넣으세요
        </p>
        <div className="flex flex-wrap gap-2">
          {unassigned.length === 0 ? (
            <span className="text-sm text-black/35">
              모든 학생이 배정되었습니다.
            </span>
          ) : (
            unassigned.map((s) => <Chip key={s.uid} uid={s.uid} />)
          )}
        </div>
      </div>

      {/* 모둠 목록 */}
      <div className="grid gap-3 sm:grid-cols-2">
        {groups.map((g) => {
          const active = dragOver === g.id;
          return (
          <div
            key={g.id}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(g.id);
            }}
            onDragLeave={() => setDragOver((v) => (v === g.id ? null : v))}
            onDrop={(e) => onDrop(e, g.id)}
            className={`flex flex-col gap-3 rounded-2xl p-4 transition ${
              active
                ? "bg-[var(--md-sys-color-primary-container)] ring-2 ring-[var(--md-sys-color-primary)] shadow-lg"
                : `bg-[var(--md-sys-color-surface-container)] ${
                    dragging
                      ? "ring-2 ring-dashed ring-[var(--md-sys-color-outline-variant)]"
                      : ""
                  }`
            }`}
          >
            <div className="flex items-center gap-2">
              <input
                defaultValue={g.name}
                onBlur={(e) => {
                  if (e.target.value.trim() && e.target.value !== g.name)
                    updateGroup(cid, g.id, {
                      name: e.target.value,
                    }).then(reload);
                }}
                className="min-w-0 flex-1 rounded-lg bg-transparent px-1 text-base font-bold outline-none focus:bg-white/60"
              />
              <span className="rounded-full bg-black/5 px-2.5 py-0.5 text-xs font-semibold text-black/50">
                {g.memberUids.length}명
              </span>
              <button
                onClick={async () => {
                  if (
                    await dialog.confirm({
                      title: "모둠 삭제",
                      body: `'${g.name}' 모둠을 삭제할까요?`,
                      danger: true,
                    })
                  ) {
                    await deleteGroup(cid, g.id);
                    reload();
                  }
                }}
                className="text-black/30 hover:text-[var(--md-sys-color-error)]"
              >
                <Icon name="delete" size={18} />
              </button>
            </div>
            <div
              className={`flex min-h-[3.5rem] flex-wrap content-start gap-2 rounded-xl p-2 transition ${
                active
                  ? "bg-white/40"
                  : g.memberUids.length === 0
                  ? "bg-black/[0.02]"
                  : ""
              }`}
            >
              {g.memberUids.length === 0 ? (
                <span className="flex w-full items-center justify-center gap-1.5 py-2 text-sm font-medium text-black/35">
                  <Icon name="add" size={16} />
                  {active ? "여기에 놓기" : "여기로 학생을 끌어오세요"}
                </span>
              ) : (
                g.memberUids.map((uid) => (
                  <span
                    key={uid}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/uid", uid);
                      setDragging(true);
                    }}
                    onDragEnd={() => {
                      setDragging(false);
                      setDragOver(null);
                    }}
                    className="inline-flex cursor-grab items-center gap-1.5 rounded-full bg-[var(--md-sys-color-primary-container)] px-3.5 py-2 text-sm font-semibold text-[var(--md-sys-color-on-primary-container)] shadow-sm active:cursor-grabbing"
                  >
                    {nameOf(uid)}
                    <button
                      onClick={() => move(uid, null)}
                      className="text-current/60 hover:text-[var(--md-sys-color-error)]"
                      title="미배정으로"
                    >
                      <Icon name="close" size={14} />
                    </button>
                  </span>
                ))
              )}
            </div>
            {unassigned.length > 0 && (
              <select
                className="m3-field !py-2 !text-sm"
                value=""
                onChange={(e) => e.target.value && move(e.target.value, g.id)}
              >
                <option value="">+ 학생 추가</option>
                {unassigned.map((s) => (
                  <option key={s.uid} value={s.uid}>
                    {s.displayName}
                  </option>
                ))}
              </select>
            )}
          </div>
          );
        })}
        {groups.length === 0 && (
          <p className="col-span-full py-6 text-center text-sm text-black/40">
            아직 모둠이 없습니다. 위에서 모둠을 추가하세요.
          </p>
        )}
      </div>
      {busy && (
        <p className="text-center text-xs text-black/40">저장 중…</p>
      )}
    </div>
  );
}
