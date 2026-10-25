"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError, type Me } from "./workshop-api";
import { usePageVisible } from "./use-page-visible";
import { serializeProject } from "../lib/world/bundle";
import type { ProjectState } from "../lib/world/project";
import { getProject, loadMap } from "../lib/world/storage";

export interface LessonControls {
  paused: boolean;
  blackout: boolean;
  muted: boolean;
}
export interface LessonMessage {
  id: string;
  senderId: string;
  senderName: string;
  role: "teacher" | "student";
  recipientId: string | null;
  text: string;
  at: number;
}
export interface LessonState {
  classId: string;
  className: string;
  teacherId: string;
  selfId: string;
  role: "teacher" | "student";
  rev: number;
  serverTime: number;
  controls: LessonControls;
  students: Array<{
    id: string;
    name: string;
    online: boolean;
    controls?: LessonControls;
  }>;
  messages: LessonMessage[];
  world: { revision: string; name: string; publishedAt: number } | null;
}
interface ClassroomContextValue {
  me: Me | null;
  classId: string;
  classes: Array<{ id: string; name: string }>;
  selectClass: (id: string) => void;
  room: LessonState | null;
  error: string;
  connected: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  command: (action: string, data?: Record<string, unknown>) => Promise<void>;
  publish: (
    name: string,
    description: string,
    ps: ProjectState,
  ) => Promise<void>;
  publishProject: (id: string) => Promise<void>;
}
const Context = createContext<ClassroomContextValue | null>(null);
export function useClassroom() {
  return useContext(Context);
}

export function ClassroomProvider({
  me,
  routeClassId,
  inClassroom = false,
  children,
}: {
  me: Me | null;
  routeClassId?: string;
  inClassroom?: boolean;
  children: ReactNode;
}) {
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [selected, setSelected] = useState("");
  const [room, setRoom] = useState<LessonState | null>(null);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [open, setOpen] = useState(false);
  const visible = usePageVisible();
  const streaming = visible && (inClassroom || open);
  const classId =
    me?.student?.classId ||
    (me?.role === "teacher" ? routeClassId || selected : "");
  const teacherId = me?.teacher?.id;
  const identity = `${me?.role || ""}:${me?.student?.id || teacherId || ""}`;
  const classRef = useRef(classId);
  useEffect(() => {
    classRef.current = classId;
  }, [classId]);
  const selectClass = useCallback(
    (id: string) => {
      setSelected(id);
      if (teacherId) sessionStorage.setItem(`jamworld.class.${teacherId}`, id);
      if (routeClassId && routeClassId !== id)
        window.location.href = `/jamworldmake/?view=classroom&id=${encodeURIComponent(id)}`;
    },
    [teacherId, routeClassId],
  );
  useEffect(() => {
    if (me?.role !== "teacher") return;
    let live = true;
    const load = (preferred?: string) =>
      api<{ classes: Array<{ id: string; name: string }> }>(
        "/api/jamworld/workshop/classes",
      )
        .then((data) => {
          if (!live) return;
          setClasses(data.classes);
          const saved = sessionStorage.getItem(`jamworld.class.${teacherId}`);
          setSelected(
            (current) =>
              data.classes.find((c) => c.id === preferred)?.id ||
              (data.classes.some((c) => c.id === current)
                ? current
                : data.classes.find((c) => c.id === saved)?.id ||
                  data.classes[0]?.id ||
                  ""),
          );
        })
        .catch(() => {
          if (live) setError("공방 목록을 불러오지 못했어요");
        });
    const changed = (event: Event) => {
      void load(
        event instanceof CustomEvent && typeof event.detail === "string"
          ? event.detail
          : undefined,
      );
    };
    const focus = () => {
      void load();
    };
    void load();
    window.addEventListener("jamworld-classes", changed);
    window.addEventListener("focus", focus);
    return () => {
      live = false;
      window.removeEventListener("jamworld-classes", changed);
      window.removeEventListener("focus", focus);
    };
  }, [me?.role, teacherId]);
  const apply = useCallback((value: LessonState) => {
    if (value.classId !== classRef.current) return;
    setRoom((prev) =>
      !prev ||
      prev.classId !== value.classId ||
      value.rev > prev.rev ||
      (value.rev === prev.rev && value.serverTime >= prev.serverTime)
        ? value
        : prev,
    );
  }, []);
  useEffect(() => {
    if (!classId || !streaming) return;
    const ctrl = new AbortController();
    let retry: ReturnType<typeof setTimeout> | undefined;
    let resolveRetry: (() => void) | undefined;
    const poll = async () => {
      let rev = -1;
      let lastSnapshot = 0;
      while (!ctrl.signal.aborted && !document.hidden) {
        try {
          const data = await api<LessonState | { unchanged: true; rev: number }>(
            `/api/jamworld/classroom/${encodeURIComponent(classId)}?compact=1&after=${rev}${rev >= 0 ? "&wait=1" : ""}&roster=${Date.now() - lastSnapshot >= 30000 ? "1" : "0"}`,
            { signal: ctrl.signal },
          );
          if (ctrl.signal.aborted) return;
          if (!("unchanged" in data)) {
            apply(data);
            lastSnapshot = Date.now();
          }
          rev = data.rev;
          setConnected(true);
          setError("");
        } catch (e) {
          if (ctrl.signal.aborted) return;
          setConnected(false);
          setError(
            e instanceof Error ? e.message : "수업 연결을 확인해 주세요",
          );
          if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
            ctrl.abort();
            break;
          }
          await new Promise<void>((resolve) => {
            resolveRetry = resolve;
            retry = setTimeout(resolve, 2500);
          });
        }
      }
    };
    void poll();
    const presence = () => {
      if (me?.role !== "student" || document.hidden || ctrl.signal.aborted) return;
      void api(`/api/jamworld/classroom/${encodeURIComponent(classId)}`, {
        method: "POST",
        json: { action: "presence" },
        signal: ctrl.signal,
      }).catch(() => undefined);
    };
    presence();
    const heartbeat = setInterval(presence, 45000);
    return () => {
      ctrl.abort();
      clearInterval(heartbeat);
      clearTimeout(retry);
      resolveRetry?.();
    };
  }, [classId, identity, apply, streaming, me?.role]);
  const current =
    room?.classId === classId && `${room.role}:${room.selfId}` === identity
      ? room
      : null;
  const command = useCallback(
    async (action: string, data: Record<string, unknown> = {}) => {
      if (!classId) throw new Error("먼저 공방을 만들어 주세요");
      const value = await api<LessonState>(
        `/api/jamworld/classroom/${encodeURIComponent(classId)}`,
        { method: "POST", json: { action, ...data } },
      );
      apply(value);
    },
    [classId, apply],
  );
  const publish = useCallback(
    async (name: string, description: string, ps: ProjectState) => {
      await command("publish", {
        bundle: serializeProject(name, description, ps),
      });
      window.location.href = `/jamworldmake/?view=classroom&id=${encodeURIComponent(classId)}`;
    },
    [command, classId],
  );
  const publishProject = useCallback(
    async (id: string) => {
      const project = getProject(id);
      if (!project) throw new Error("월드를 찾을 수 없어요");
      const docs = Object.fromEntries(
        project.mapIds.map((mapId) => [mapId, loadMap(mapId)]),
      );
      if (Object.values(docs).some((doc) => !doc))
        throw new Error("월드의 페이지를 찾을 수 없어요");
      await publish(project.name, project.description, {
        order: project.mapIds,
        docs: docs as ProjectState["docs"],
      });
    },
    [publish],
  );
  return (
    <Context.Provider
      value={{
        me,
        classId,
        classes,
        selectClass,
        room: current,
        error,
        connected: connected && !!current && streaming,
        open,
        setOpen,
        command,
        publish,
        publishProject,
      }}
    >
      {children}
    </Context.Provider>
  );
}
