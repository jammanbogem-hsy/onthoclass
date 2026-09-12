"use client";

import {
  Suspense,
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import HTMLFlipBook from "react-pageflip";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/contexts/AuthContext";
import {
  getMyRole,
  listMembers,
  listMyClasses,
  type ClassRoom,
  type Member,
  type Role,
} from "@/lib/classes";
import {
  deleteBook7Note,
  saveBook7Captions,
  saveBook7Note,
  saveBook7Submission,
  watchBook7Notes,
  watchBook7Submissions,
  type Book7Note,
  type Book7Submission,
} from "@/lib/book7";
import "./book7.css";

type FlipBookHandle = {
  pageFlip: () => {
    flipNext: (corner?: "top" | "bottom") => void;
    flipPrev: (corner?: "top" | "bottom") => void;
  };
};

type DisplaySubmission = Book7Submission & {
  displayName?: string;
  demo?: boolean;
};

/** 데스크톱 위에 떠 있는 창 하나 — 맥처럼 옮기고, 접고, 키울 수 있다. */
type WinId = "book" | "folder" | "upload" | "note";
type Win = {
  id: WinId;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  max: boolean;
  min: boolean;
};

const MENUBAR_H = 30;
const DOCK_H = 92;

const WIN_SIZE: Record<WinId, { w: number; h: number }> = {
  book: { w: 1180, h: 860 },
  folder: { w: 940, h: 620 },
  upload: { w: 820, h: 660 },
  note: { w: 560, h: 480 },
};

/** 소감에 붙이는 기분 아이콘 — 바탕화면이 한눈에 알록달록해진다. */
const MOODS = ["📝", "😀", "🌊", "🏖️", "⛺", "🍦", "⭐", "🌈"];

const JAMMANBO_DEMO: DisplaySubmission[] = [
  {
    uid: "book7-demo-haneul",
    page1URL: "/book7/demo/page-1.png",
    page2URL: "/book7/demo/page-2.png",
    page1Caption: "We played on the sunny beach and made a sandcastle.",
    page2Caption: "I ate sweet strawberry ice cream by the blue sea.",
    updatedAt: null,
    displayName: "김하늘 · 샘플",
    demo: true,
  },
  {
    uid: "book7-demo-minjun",
    page1URL: "/book7/demo/page-3.png",
    page2URL: "/book7/demo/page-4.png",
    page1Caption: "My family went camping in the green mountains.",
    page2Caption: "We had so much fun at the water park.",
    updatedAt: null,
    displayName: "박민준 · 샘플",
    demo: true,
  },
];

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

function formatClock(date: Date) {
  const hour = date.getHours();
  const meridiem = hour < 12 ? "오전" : "오후";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${WEEKDAY[date.getDay()]}) ${meridiem} ${display}:${minute}`;
}

/** 서버 렌더 결과와 어긋나지 않도록 시계는 마운트 뒤부터 그린다. */
function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 20_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

const BookPage = forwardRef<
  HTMLDivElement,
  { children: ReactNode; hard?: boolean; className?: string }
>(function BookPage({ children, hard = false, className = "" }, ref) {
  return (
    <div
      ref={ref}
      className={`book7-page ${className}`}
      data-density={hard ? "hard" : "soft"}
    >
      {children}
    </div>
  );
});

function UploadTile({
  number,
  file,
  preview,
  onChange,
}: {
  number: 1 | 2;
  file: File | null;
  preview: string;
  onChange: (file: File | null) => void;
}) {
  function pick(event: ChangeEvent<HTMLInputElement>) {
    onChange(event.target.files?.[0] ?? null);
    event.target.value = "";
  }

  return (
    <label className="book7-upload-tile flex cursor-pointer flex-col items-center justify-center text-center">
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        capture="environment"
        className="sr-only"
        onChange={pick}
      />
      {preview ? (
        // Firebase Storage/로컬 object URL은 next/image 최적화 대상이 아니다.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt={`${number}쪽 미리보기`} className="h-full w-full object-contain" />
      ) : (
        <span className="flex flex-col items-center gap-3 p-5">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-[#dcefe9] text-[#0f6e56]">
            <Icon name="add_a_photo" size={30} />
          </span>
          <span className="text-lg font-black">{number}쪽 촬영하기</span>
          <span className="text-sm text-black/55">사진을 고르거나 카메라로 찍어요</span>
        </span>
      )}
      {file && (
        <span className="absolute bottom-3 right-3 rounded-full bg-[#0f6e56] px-3 py-1 text-xs font-bold text-white shadow">
          다시 고르기
        </span>
      )}
    </label>
  );
}

function MenuButton({
  label,
  open,
  onToggle,
  children,
  strong = false,
}: {
  label: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="book7-menu">
      <button
        type="button"
        className={`book7-menu-btn ${strong ? "is-strong" : ""}`}
        data-open={open}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={onToggle}
      >
        {label}
      </button>
      {open && (
        <div role="menu" className="book7-menu-panel">
          {children}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  checked,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  checked?: boolean;
  disabled?: boolean;
}) {
  return (
    <button type="button" role="menuitem" className="book7-menu-item" onClick={onClick} disabled={disabled}>
      <span className="book7-menu-check">{checked ? "✓" : ""}</span>
      <span>{children}</span>
    </button>
  );
}

function MacWindow({
  win,
  title,
  fileIcon,
  immersive = false,
  toolbar,
  bodyClass = "",
  bodyRef,
  children,
  onClose,
  onMinimize,
  onZoom,
  onFocus,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  win: Win;
  title: string;
  fileIcon?: ReactNode;
  immersive?: boolean;
  toolbar?: ReactNode;
  bodyClass?: string;
  bodyRef?: RefObject<HTMLDivElement | null>;
  children: ReactNode;
  onClose: () => void;
  onMinimize: () => void;
  onZoom: () => void;
  onFocus: () => void;
  onDragStart: (event: ReactPointerEvent<HTMLElement>) => void;
  onDragMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onDragEnd: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  return (
    <section
      role="dialog"
      aria-label={title}
      className="book7-window"
      data-max={win.max}
      data-immersive={immersive}
      hidden={win.min}
      style={
        immersive
          ? { zIndex: 400 }
          : win.max
            ? { zIndex: win.z }
            : { left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z }
      }
      onPointerDown={onFocus}
    >
      <header
        className="book7-titlebar"
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        onDoubleClick={onZoom}
      >
        <span className="book7-lights">
          <button type="button" className="book7-light is-close" aria-label="창 닫기" onClick={onClose}>
            <Icon name="close" size={9} weight={700} />
          </button>
          <button type="button" className="book7-light is-min" aria-label="창 내리기" onClick={onMinimize}>
            <Icon name="remove" size={9} weight={700} />
          </button>
          <button type="button" className="book7-light is-zoom" aria-label="창 크게" onClick={onZoom}>
            <Icon name={win.max ? "close_fullscreen" : "open_in_full"} size={8} weight={700} />
          </button>
        </span>
        <span className="book7-window-title">
          {fileIcon}
          {title}
        </span>
      </header>
      {toolbar}
      <div ref={bodyRef} className={`book7-window-body ${bodyClass}`}>
        {children}
      </div>
    </section>
  );
}

function cacheBusted(url: string, updatedAt: number | null) {
  if (!updatedAt) return url;
  return `${url}${url.includes("?") ? "&" : "?"}v=${updatedAt}`;
}

function Book7Inner() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const requestedClass = params.get("class") ?? "";
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [classId, setClassId] = useState("");
  const [role, setRole] = useState<Role | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [submissions, setSubmissions] = useState<Book7Submission[]>([]);
  const [ready, setReady] = useState(false);
  const [file1, setFile1] = useState<File | null>(null);
  const [file2, setFile2] = useState<File | null>(null);
  const [caption1, setCaption1] = useState("");
  const [caption2, setCaption2] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [soundOn, setSoundOn] = useState(true);
  const [teacherPreview, setTeacherPreview] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [openMenu, setOpenMenu] = useState<"jam" | "file" | "view" | "class" | null>(null);
  const [selectedIcon, setSelectedIcon] = useState<string>("");
  const [liveWallpaper, setLiveWallpaper] = useState(false);
  const [wallpaperReady, setWallpaperReady] = useState(false);
  const [wins, setWins] = useState<Win[]>([]);
  const [bookTarget, setBookTarget] = useState<"class" | string>("class");
  const [bookImmersive, setBookImmersive] = useState(false);
  const [notes, setNotes] = useState<Book7Note[]>([]);
  const [noteTarget, setNoteTarget] = useState("");
  const [noteText, setNoteText] = useState("");
  const [noteMood, setNoteMood] = useState("📝");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteMessage, setNoteMessage] = useState("");
  const bookRef = useRef<FlipBookHandle | null>(null);
  const bookBodyRef = useRef<HTMLDivElement | null>(null);
  const [bookStage, setBookStage] = useState({ w: 900, h: 560 });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const zRef = useRef(10);
  const dragRef = useRef<{ id: WinId; dx: number; dy: number; pointerId: number } | null>(null);
  const clock = useClock();

  const bookWindowOpen = wins.some((item) => item.id === "book");

  // 창을 키우거나 화면이 바뀌어도 책이 본문 안에 딱 맞도록 실제 크기를 잰다.
  useEffect(() => {
    const node = bookBodyRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const box = entry.contentRect;
      const w = Math.round(box.width);
      const h = Math.round(box.height);
      setBookStage((current) => (current.w === w && current.h === h ? current : { w, h }));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [bookWindowOpen]);

  const preview1 = useMemo(() => (file1 ? URL.createObjectURL(file1) : ""), [file1]);
  const preview2 = useMemo(() => (file2 ? URL.createObjectURL(file2) : ""), [file2]);
  useEffect(
    () => () => {
      if (preview1) URL.revokeObjectURL(preview1);
    },
    [preview1]
  );
  useEffect(
    () => () => {
      if (preview2) URL.revokeObjectURL(preview2);
    },
    [preview2]
  );

  useEffect(() => {
    if (!loading && !user) router.replace("/?next=/book7");
  }, [loading, router, user]);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const narrow = window.matchMedia("(max-width: 860px)").matches;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
      ?.saveData;
    setLiveWallpaper(!reduceMotion && !narrow && !saveData);
  }, []);

  useEffect(() => {
    const handleFullscreen = () => {
      const on = Boolean(document.fullscreenElement);
      setIsFullscreen(on);
      if (!on) setBookImmersive(false);
    };
    document.addEventListener("fullscreenchange", handleFullscreen);
    return () => document.removeEventListener("fullscreenchange", handleFullscreen);
  }, []);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    listMyClasses(user.uid)
      .then((items) => {
        if (!alive) return;
        setClasses(items);
        const selected = items.some((item) => item.id === requestedClass)
          ? requestedClass
          : items[0]?.id ?? "";
        setClassId(selected);
        setReady(true);
      })
      .catch(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, [requestedClass, user]);

  useEffect(() => {
    if (!user || !classId) return;
    Promise.all([getMyRole(classId, user.uid), listMembers(classId)]).then(
      ([nextRole, nextMembers]) => {
        setRole(nextRole);
        setMembers(nextMembers);
      }
    );
    const stopPages = watchBook7Submissions(classId, (nextSubmissions) => {
      setSubmissions(nextSubmissions);
      const own = nextSubmissions.find((item) => item.uid === user.uid);
      if (own) {
        setCaption1((current) => current || own.page1Caption);
        setCaption2((current) => current || own.page2Caption);
      }
    });
    const stopNotes = watchBook7Notes(classId, setNotes);
    return () => {
      stopPages();
      stopNotes();
    };
  }, [classId, user]);

  const currentClass = classes.find((item) => item.id === classId);
  const ownSubmission = submissions.find((item) => item.uid === user?.uid);
  const studentOrder = useMemo(
    () =>
      new Map(
        members
          .filter((member) => member.role === "student")
          .map((member, index) => [member.uid, index])
      ),
    [members]
  );
  const finished = useMemo(
    () =>
      submissions
        .filter((item) => item.page1URL && item.page2URL && studentOrder.has(item.uid))
        .sort(
          (a, b) =>
            (studentOrder.get(a.uid) ?? Number.MAX_SAFE_INTEGER) -
            (studentOrder.get(b.uid) ?? Number.MAX_SAFE_INTEGER)
        ),
    [studentOrder, submissions]
  );
  const memberMap = useMemo(
    () => new Map(members.map((member) => [member.uid, member])),
    [members]
  );
  const showJammanboDemo =
    currentClass?.name.replace(/\s/g, "").toUpperCase() === "JAMMANBO";
  const displaySubmissions: DisplaySubmission[] = showJammanboDemo
    ? [...JAMMANBO_DEMO, ...finished]
    : finished;
  const activeSubmissions =
    bookTarget === "class"
      ? displaySubmissions
      : displaySubmissions.filter((item) => item.uid === bookTarget);
  const selectedStudent = activeSubmissions[0];
  const selectedStudentName = selectedStudent
    ? selectedStudent.displayName ||
      memberMap.get(selectedStudent.uid)?.displayName ||
      "우리 반 친구"
    : "";
  const pageCount = activeSubmissions.length * 2 + 2;
  const canUpload = role === "student" || (role === "teacher" && teacherPreview);

  /** 창 크기가 바뀌면 플립북이 스스로 다시 재보정하도록 리사이즈 신호를 준다. */
  const nudgeLayout = useCallback(() => {
    requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
  }, []);

  const openWin = useCallback(
    (id: WinId) => {
      setOpenMenu(null);
      setWins((current) => {
        const z = ++zRef.current;
        if (current.some((item) => item.id === id)) {
          return current.map((item) => (item.id === id ? { ...item, z, min: false } : item));
        }
        const vw = window.innerWidth;
        // 바탕화면은 메뉴 막대와 Dock 사이 — 창이 Dock을 덮지 않게 그 안에서 잡는다.
        const deskH = window.innerHeight - MENUBAR_H - DOCK_H;
        const base = WIN_SIZE[id];
        const h = Math.max(300, Math.min(base.h, deskH - 24));
        // 책 창은 펼친 두 쪽(3:4)이 꼭 맞는 가로폭으로 연다.
        const spread = Math.round((h - 130) * 0.75 * 2) + 56;
        const w = Math.max(300, Math.min(base.w, vw - 64, id === "book" ? spread : base.w));
        const cascade = current.length * 26;
        return [
          ...current,
          {
            id,
            w,
            h,
            z,
            max: false,
            min: false,
            x: Math.max(14, Math.round((vw - w) / 2) - 20 + cascade),
            y: Math.max(10, Math.round((deskH - h) / 2) - 8 + cascade),
          },
        ];
      });
      nudgeLayout();
    },
    [nudgeLayout]
  );

  const closeWin = useCallback((id: WinId) => {
    setWins((current) => current.filter((item) => item.id !== id));
  }, []);

  const focusWin = useCallback((id: WinId) => {
    setWins((current) => {
      const top = current.reduce((max, item) => Math.max(max, item.z), 0);
      if (current.find((item) => item.id === id)?.z === top) return current;
      const z = ++zRef.current;
      return current.map((item) => (item.id === id ? { ...item, z } : item));
    });
  }, []);

  const toggleZoom = useCallback(
    (id: WinId) => {
      setWins((current) => current.map((item) => (item.id === id ? { ...item, max: !item.max } : item)));
      nudgeLayout();
    },
    [nudgeLayout]
  );

  const minimizeWin = useCallback((id: WinId) => {
    setWins((current) => current.map((item) => (item.id === id ? { ...item, min: true } : item)));
  }, []);

  const openBook = useCallback(
    (target: "class" | string) => {
      setBookTarget(target);
      setCurrentPage(0);
      openWin("book");
    },
    [openWin]
  );

  const openNote = useCallback(
    (targetUid: string) => {
      setNoteTarget(targetUid);
      if (targetUid === user?.uid) {
        const own = notes.find((item) => item.uid === user?.uid);
        setNoteText(own?.text ?? "");
        setNoteMood(own?.mood ?? "📝");
      }
      openWin("note");
    },
    [notes, openWin, user]
  );

  const toggleBookFull = useCallback(async () => {
    const next = !bookImmersive;
    setBookImmersive(next);
    try {
      if (next && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else if (!next && document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      /* 브라우저가 막아도 창 안에서 크게 보는 것은 그대로 된다 */
    }
    nudgeLayout();
  }, [bookImmersive, nudgeLayout]);

  const dragStart = useCallback(
    (id: WinId) => (event: ReactPointerEvent<HTMLElement>) => {
      if ((event.target as HTMLElement).closest("button")) return;
      const win = wins.find((item) => item.id === id);
      if (!win || win.max) return;
      focusWin(id);
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        id,
        dx: event.clientX - win.x,
        dy: event.clientY - MENUBAR_H - win.y,
        pointerId: event.pointerId,
      };
    },
    [focusWin, wins]
  );

  const dragMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const x = Math.min(window.innerWidth - 140, Math.max(-60, event.clientX - drag.dx));
    const deskH = window.innerHeight - MENUBAR_H - DOCK_H;
    const y = Math.min(deskH - 44, Math.max(0, event.clientY - MENUBAR_H - drag.dy));
    setWins((current) => current.map((item) => (item.id === drag.id ? { ...item, x, y } : item)));
  }, []);

  const dragEnd = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }, []);

  const chooseClass = (nextClassId: string) => {
    setRole(null);
    setMembers([]);
    setSubmissions([]);
    setClassId(nextClassId);
    setCurrentPage(0);
    setTeacherPreview(false);
    setCaption1("");
    setCaption2("");
    setBookTarget("class");
    setBookImmersive(false);
    setNotes([]);
    setNoteTarget("");
    setNoteText("");
    setNoteMood("📝");
    setWins([]);
    setOpenMenu(null);
    router.replace(`/book7?class=${encodeURIComponent(nextClassId)}`);
  };

  const playTurn = useCallback(() => {
    if (!soundOn || !audioRef.current) return;
    audioRef.current.currentTime = 0;
    audioRef.current.volume = 0.35;
    void audioRef.current.play().catch(() => {});
  }, [soundOn]);

  const toggleFullscreen = useCallback(async () => {
    setOpenMenu(null);
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      /* 브라우저가 막으면 그냥 창 모드로 쓴다 */
    }
  }, []);

  // 바탕화면 빈 곳을 누르면 메뉴와 아이콘 선택이 풀린다 — 맥과 같은 감각.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenMenu(null);
      if (bookImmersive) {
        setBookImmersive(false);
        return;
      }
      setWins((current) => {
        if (!current.length) return current;
        const top = current.reduce((a, b) => (a.z > b.z ? a : b));
        return current.filter((item) => item.id !== top.id);
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bookImmersive]);

  async function submitPages() {
    if (!user || !classId || !canUpload) return;
    const englishOnly = (value: string) =>
      /[A-Za-z]/.test(value) && !/[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(value);
    if (!englishOnly(caption1) || !englishOnly(caption2)) {
      setMessage("각 그림을 설명하는 영어 문장을 입력해 주세요.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      if (file1 && file2) {
        await saveBook7Submission({
          classId,
          uid: user.uid,
          page1: file1,
          page2: file2,
          page1Caption: caption1,
          page2Caption: caption2,
        });
      } else if (ownSubmission && !file1 && !file2) {
        await saveBook7Captions({
          classId,
          uid: user.uid,
          page1Caption: caption1,
          page2Caption: caption2,
        });
      } else {
        setMessage("사진을 바꾸려면 두 페이지를 모두 선택해 주세요.");
        return;
      }
      setFile1(null);
      setFile2(null);
      setMessage(
        role === "teacher"
          ? "학생 화면 체험용 두 페이지를 저장했어요. 실제 책에는 들어가지 않아요."
          : "두 페이지를 우리 반 여름 앨범에 넣었어요!"
      );
    } catch {
      setMessage("업로드하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  async function submitNote() {
    if (!user || !classId || !noteText.trim()) return;
    setNoteSaving(true);
    setNoteMessage("");
    try {
      await saveBook7Note({
        classId,
        uid: user.uid,
        text: noteText.slice(0, 400),
        mood: noteMood,
      });
      setNoteMessage("바탕화면에 붙였어요!");
    } catch (error) {
      setNoteMessage(`올리지 못했어요 — ${(error as Error).message}`);
    } finally {
      setNoteSaving(false);
    }
  }

  async function removeNote(targetUid: string) {
    if (!classId) return;
    try {
      await deleteBook7Note(classId, targetUid);
    } catch (error) {
      setNoteMessage(`치우지 못했어요 — ${(error as Error).message}`);
      return;
    }
    if (targetUid === user?.uid) {
      setNoteText("");
      setNoteMood("📝");
    }
    closeWin("note");
  }

  if (loading || !user || !ready) {
    return (
      <main className="book7-os book7-os-boot">
        <div className="book7-boot">
          <span className="book7-jam-mark book7-boot-mark">J</span>
          <p>여름 앨범 컴퓨터를 켜는 중…</p>
          <span className="book7-boot-bar" aria-hidden />
        </div>
      </main>
    );
  }

  const bookWin = wins.find((item) => item.id === "book");
  const folderWin = wins.find((item) => item.id === "folder");
  const uploadWin = wins.find((item) => item.id === "upload");
  const noteWin = wins.find((item) => item.id === "note");
  const myNote = notes.find((item) => item.uid === user.uid);
  const activeNote = notes.find((item) => item.uid === noteTarget);
  const noteIsMine = noteTarget === user.uid;
  const noteOwnerName = noteIsMine
    ? "나"
    : memberMap.get(noteTarget)?.displayName ?? "우리 반 친구";
  const desktopNotes = [...notes].sort(
    (a, b) =>
      (studentOrder.get(a.uid) ?? Number.MAX_SAFE_INTEGER) -
      (studentOrder.get(b.uid) ?? Number.MAX_SAFE_INTEGER)
  );
  const bookPageW = Math.max(
    200,
    Math.min(520, Math.floor(bookStage.h * 0.75) - 6, Math.floor((bookStage.w - 6) / 2))
  );
  const bookPageH = Math.round(bookPageW / 0.75);
  const bookTitle =
    bookTarget === "class" ? "학급_여름앨범.book" : `${selectedStudentName}.book`;
  const studentTotal = members.filter((member) => member.role === "student").length;

  const dockItems: {
    id: string;
    label: string;
    art: ReactNode;
    active: boolean;
    onClick: () => void;
  }[] = [
    {
      id: "book",
      label: "학급 여름 앨범",
      art: (
        <span className="book7-dock-book" aria-hidden>
          <Icon name="auto_stories" size={24} />
        </span>
      ),
      active: Boolean(bookWin),
      onClick: () => openBook("class"),
    },
    {
      id: "folder",
      label: "학생 개별 작품",
      art: (
        <span className="book7-dock-folder" aria-hidden>
          <Icon name="folder_open" size={26} fill />
        </span>
      ),
      active: Boolean(folderWin),
      onClick: () => openWin("folder"),
    },
    {
      id: "note",
      label: myNote ? "내 소감 고치기" : "소감 쓰기",
      art: (
        <span className="book7-dock-note" aria-hidden>
          <Icon name="sticky_note_2" size={25} fill />
        </span>
      ),
      active: Boolean(noteWin),
      onClick: () => openNote(user.uid),
    },
    {
      id: "upload",
      label: "내 작품 올리기",
      art: (
        <span className="book7-dock-app" aria-hidden>
          <Icon name="photo_camera" size={26} />
        </span>
      ),
      active: Boolean(uploadWin),
      onClick: () => openWin("upload"),
    },
  ];

  return (
    <main className="book7-os" data-immersive={bookImmersive}>
      {liveWallpaper && (
        <video
          className={`book7-wallpaper ${wallpaperReady ? "is-ready" : ""}`}
          poster="/book7/assets/jam-desktop-still.jpg"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden
          onCanPlay={() => setWallpaperReady(true)}
        >
          <source src="/book7/assets/jam-desktop-live.mp4" type="video/mp4" />
        </video>
      )}
      <audio ref={audioRef} src="/sounds/page-turn.mp3" preload="auto" />

      <div className="book7-menubar" onPointerDown={(event) => event.stopPropagation()}>
        <MenuButton
          label={<span className="book7-jam-mark book7-menu-mark">J</span>}
          open={openMenu === "jam"}
          onToggle={() => setOpenMenu(openMenu === "jam" ? null : "jam")}
        >
          <p className="book7-menu-note">Lesson 7 · 우리 모둠 여름 앨범</p>
          <div className="book7-menu-sep" />
          <MenuItem onClick={toggleFullscreen}>
            {isFullscreen ? "전체 화면 끝내기" : "전체 화면으로 보기"}
          </MenuItem>
          <MenuItem
            onClick={() => {
              setOpenMenu(null);
              router.push("/dashboard");
            }}
          >
            대시보드로 나가기
          </MenuItem>
        </MenuButton>

        <span className="book7-menu-app">여름 앨범</span>

        <MenuButton
          label="파일"
          open={openMenu === "file"}
          onToggle={() => setOpenMenu(openMenu === "file" ? null : "file")}
        >
          <MenuItem onClick={() => openBook("class")}>학급 앨범 열기</MenuItem>
          <MenuItem onClick={() => openWin("folder")}>학생 작품 폴더 열기</MenuItem>
          <MenuItem onClick={() => openWin("upload")}>내 작품 올리기</MenuItem>
          <MenuItem onClick={() => openNote(user.uid)}>
            {myNote ? "내 소감 고치기" : "소감 쓰기"}
          </MenuItem>
          <div className="book7-menu-sep" />
          <MenuItem onClick={() => setWins([])} disabled={!wins.length}>
            창 모두 닫기
          </MenuItem>
        </MenuButton>

        <MenuButton
          label="보기"
          open={openMenu === "view"}
          onToggle={() => setOpenMenu(openMenu === "view" ? null : "view")}
        >
          <MenuItem checked={soundOn} onClick={() => setSoundOn((value) => !value)}>
            페이지 넘김 소리
          </MenuItem>
          <MenuItem checked={isFullscreen} onClick={toggleFullscreen}>
            전체 화면
          </MenuItem>
          <div className="book7-menu-sep" />
          <MenuItem
            onClick={() => {
              setWins((current) => current.map((item) => ({ ...item, min: true })));
              setOpenMenu(null);
            }}
            disabled={!wins.length}
          >
            바탕화면 보기
          </MenuItem>
        </MenuButton>

        <span className="book7-menubar-spacer" />

        <button
          type="button"
          className="book7-status-btn"
          aria-pressed={soundOn}
          aria-label={soundOn ? "넘김 소리 끄기" : "넘김 소리 켜기"}
          onClick={() => setSoundOn((value) => !value)}
        >
          <Icon name={soundOn ? "volume_up" : "volume_off"} size={17} />
        </button>
        <button
          type="button"
          className="book7-status-btn"
          aria-label={isFullscreen ? "전체 화면 끝내기" : "전체 화면으로 보기"}
          onClick={toggleFullscreen}
        >
          <Icon name={isFullscreen ? "fullscreen_exit" : "fullscreen"} size={18} />
        </button>
        {classes.length > 1 ? (
          <MenuButton
            label={
              <span className="book7-status-class">
                <Icon name="groups" size={15} />
                {currentClass?.name ?? "학급"}
              </span>
            }
            open={openMenu === "class"}
            onToggle={() => setOpenMenu(openMenu === "class" ? null : "class")}
          >
            {classes.map((item) => (
              <MenuItem key={item.id} checked={item.id === classId} onClick={() => chooseClass(item.id)}>
                {item.name}
              </MenuItem>
            ))}
          </MenuButton>
        ) : (
          <span className="book7-status-class is-static">
            <Icon name="groups" size={15} />
            {currentClass?.name ?? "학급"}
          </span>
        )}
        <span className="book7-clock">{clock ? formatClock(clock) : ""}</span>
      </div>

      <div
        className="book7-desktop"
        onPointerDown={() => {
          setOpenMenu(null);
          setSelectedIcon("");
        }}
      >
        {classes.length === 0 ? (
          <div className="book7-alert" role="alertdialog" aria-label="학급 참여 안내">
            <span className="book7-jam-mark book7-alert-mark">J</span>
            <h2>먼저 학급에 참여해 주세요</h2>
            <p>여름 앨범은 같은 학급 친구들의 작품으로 만들어져요.</p>
            <button type="button" onClick={() => router.push("/dashboard")}>
              학급 참여하러 가기
            </button>
          </div>
        ) : (
          <>
            <div className="book7-icons">
              <button
                type="button"
                className="book7-icon"
                data-selected={selectedIcon === "book"}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => setSelectedIcon("book")}
                onDoubleClick={() => openBook("class")}
              >
                <span className="book7-art-book">
                  <span className="book7-file-corner" />
                  <Icon name="auto_stories" size={54} />
                  <small>{displaySubmissions.length * 2} PAGES</small>
                </span>
                <span className="book7-icon-label">학급_여름앨범.book</span>
              </button>
              <button
                type="button"
                className="book7-icon"
                data-selected={selectedIcon === "folder"}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => setSelectedIcon("folder")}
                onDoubleClick={() => openWin("folder")}
              >
                <span className="book7-art-folder">
                  <b>{displaySubmissions.length}</b>
                </span>
                <span className="book7-icon-label">학생_개별작품</span>
              </button>
              <button
                type="button"
                className="book7-icon"
                data-selected={selectedIcon === "upload"}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => setSelectedIcon("upload")}
                onDoubleClick={() => openWin("upload")}
              >
                <span className="book7-art-app">
                  <Icon name="photo_camera" size={44} />
                </span>
                <span className="book7-icon-label">내 작품 올리기.app</span>
              </button>
              <p className="book7-icons-hint">아이콘을 두 번 눌러 열어요</p>
            </div>

            {desktopNotes.length > 0 && (
              <div className="book7-notes" aria-label="친구들이 올린 소감">
                {desktopNotes.map((note) => {
                  const name =
                    note.uid === user.uid
                      ? "내 소감"
                      : memberMap.get(note.uid)?.displayName ?? "우리 반 친구";
                  return (
                    <button
                      key={note.uid}
                      type="button"
                      className="book7-note-icon"
                      data-selected={selectedIcon === `note:${note.uid}`}
                      data-mine={note.uid === user.uid}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => setSelectedIcon(`note:${note.uid}`)}
                      onDoubleClick={() => openNote(note.uid)}
                    >
                      <span className="book7-note-paper">
                        <span className="book7-file-corner" />
                        <b>{note.mood}</b>
                        <small>{note.text}</small>
                      </span>
                      <span className="book7-icon-label">{name}.txt</span>
                    </button>
                  );
                })}
              </div>
            )}

            <aside className="book7-widget" aria-label="여름 프로젝트 현황">
              <span className="book7-widget-kicker">SUMMER PROJECT</span>
              <strong>{displaySubmissions.length} books</strong>
              <small>Pictures + English stories</small>
              <div className="book7-widget-rows">
                <div>
                  <span>완성한 친구</span>
                  <b>
                    {displaySubmissions.length}
                    {showJammanboDemo ? " (샘플 2 포함)" : ` / ${studentTotal}`}
                  </b>
                </div>
                <div>
                  <span>앨범 쪽수</span>
                  <b>{displaySubmissions.length * 2}쪽</b>
                </div>
                <div>
                  <span>내 작품</span>
                  <b>{ownSubmission ? "제출 완료" : "아직 없어요"}</b>
                </div>
              </div>
            </aside>
          </>
        )}

        {folderWin && (
          <MacWindow
            win={folderWin}
            title="학생_개별작품"
            fileIcon={<span className="book7-title-folder" aria-hidden />}
            bodyClass="is-finder"
            onClose={() => closeWin("folder")}
            onMinimize={() => minimizeWin("folder")}
            onZoom={() => toggleZoom("folder")}
            onFocus={() => focusWin("folder")}
            onDragStart={dragStart("folder")}
            onDragMove={dragMove}
            onDragEnd={dragEnd}
          >
            <nav className="book7-finder-side" aria-label="위치">
              <p>즐겨찾기</p>
              <button type="button" onClick={() => openBook("class")}>
                <Icon name="auto_stories" size={17} />
                학급 앨범
              </button>
              <button type="button" className="is-current">
                <Icon name="folder" size={17} fill />
                학생 개별 작품
              </button>
              <button type="button" onClick={() => openWin("upload")}>
                <Icon name="photo_camera" size={17} />
                내 작품 올리기
              </button>
              <p>위치</p>
              <span className="book7-finder-place">
                <Icon name="school" size={17} />
                {currentClass?.name ?? "우리 반"}
              </span>
            </nav>
            <div className="book7-finder-main">
              <div className="book7-finder-path">
                <span>Jam Desktop</span>
                <Icon name="chevron_right" size={15} />
                <span>Lesson 7</span>
                <Icon name="chevron_right" size={15} />
                <b>학생_개별작품</b>
                <span className="book7-finder-count">{displaySubmissions.length}개 항목</span>
              </div>
              {displaySubmissions.length === 0 ? (
                <p className="book7-finder-empty">아직 완성된 작품이 없어요. 첫 번째 앨범을 올려 보세요!</p>
              ) : (
                <div className="book7-file-grid">
                  {displaySubmissions.map((submission, index) => {
                    const name =
                      submission.displayName ||
                      memberMap.get(submission.uid)?.displayName ||
                      "우리 반 친구";
                    const colors = ["#ef735f", "#e3ad46", "#3e9186", "#756fa5", "#4382a5"];
                    return (
                      <button
                        type="button"
                        key={submission.uid}
                        onClick={() => setSelectedIcon(submission.uid)}
                        onDoubleClick={() => openBook(submission.uid)}
                        data-selected={selectedIcon === submission.uid}
                        className="book7-student-file"
                        style={{ "--file-accent": colors[index % colors.length] } as CSSProperties}
                      >
                        <span className="book7-student-file-paper">
                          <span className="book7-file-corner" />
                          <span className="book7-file-preview">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={cacheBusted(submission.page1URL, submission.updatedAt)} alt="" />
                          </span>
                          <b>BOOK</b>
                          <small>2 pages · English</small>
                        </span>
                        <span className="book7-student-filename">{name}.book</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </MacWindow>
        )}

        {uploadWin && (
          <MacWindow
            win={uploadWin}
            title="내 작품 올리기"
            fileIcon={<Icon name="photo_camera" size={15} />}
            bodyClass="is-form"
            onClose={() => closeWin("upload")}
            onMinimize={() => minimizeWin("upload")}
            onZoom={() => toggleZoom("upload")}
            onFocus={() => focusWin("upload")}
            onDragStart={dragStart("upload")}
            onDragMove={dragMove}
            onDragEnd={dragEnd}
          >
            <div className="book7-form-head">
              <div>
                <p>{currentClass?.name ?? "우리 반"} · Lesson 7</p>
                <h2>사진 2장과 영어 문장을 올려요</h2>
              </div>
              {ownSubmission && <span className="book7-badge">제출 완료</span>}
            </div>

            {role === "teacher" && (
              <button
                type="button"
                aria-pressed={teacherPreview}
                onClick={() => {
                  setTeacherPreview((value) => !value);
                  setFile1(null);
                  setFile2(null);
                  setCaption1("");
                  setCaption2("");
                  setMessage("");
                }}
                className="book7-switch"
              >
                <span className="flex items-center gap-2">
                  <Icon name="preview" size={21} />
                  학생 화면 체험
                </span>
                <span className={`book7-switch-track ${teacherPreview ? "is-on" : ""}`}>
                  <span className="book7-switch-knob" />
                </span>
              </button>
            )}

            {canUpload ? (
              <>
                {teacherPreview && (
                  <p className="book7-hint-warn">
                    교사 체험용 사진은 학생 앨범과 인원 집계에 포함되지 않습니다.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="book7-upload-page">
                    <UploadTile
                      number={1}
                      file={file1}
                      preview={
                        preview1 ||
                        cacheBusted(ownSubmission?.page1URL ?? "", ownSubmission?.updatedAt ?? null)
                      }
                      onChange={setFile1}
                    />
                    <label className="book7-caption-field">
                      <span>1쪽 영어 설명</span>
                      <textarea
                        value={caption1}
                        onChange={(event) => setCaption1(event.target.value)}
                        maxLength={180}
                        rows={3}
                        placeholder="I played on the beach."
                      />
                      <small>{caption1.length}/180</small>
                    </label>
                  </div>
                  <div className="book7-upload-page">
                    <UploadTile
                      number={2}
                      file={file2}
                      preview={
                        preview2 ||
                        cacheBusted(ownSubmission?.page2URL ?? "", ownSubmission?.updatedAt ?? null)
                      }
                      onChange={setFile2}
                    />
                    <label className="book7-caption-field">
                      <span>2쪽 영어 설명</span>
                      <textarea
                        value={caption2}
                        onChange={(event) => setCaption2(event.target.value)}
                        maxLength={180}
                        rows={3}
                        placeholder="It was a wonderful day."
                      />
                      <small>{caption2.length}/180</small>
                    </label>
                  </div>
                </div>
                <p className="book7-form-note">
                  그림을 세로로 찍고, 각 그림 아래에 인쇄할 영어 문장을 적어 주세요.
                </p>
                <button
                  type="button"
                  disabled={
                    !caption1.trim() ||
                    !caption2.trim() ||
                    saving ||
                    (!ownSubmission && (!file1 || !file2)) ||
                    (!!file1 !== !!file2)
                  }
                  onClick={submitPages}
                  className="book7-primary"
                >
                  <Icon name={saving ? "hourglass_top" : "auto_stories"} size={21} />
                  {saving
                    ? "앨범에 넣는 중…"
                    : ownSubmission && !file1 && !file2
                      ? "영어 문장 저장하기"
                      : ownSubmission
                        ? "두 페이지와 문장 바꾸기"
                        : "앨범에 넣기"}
                </button>
                {message && (
                  <p role="status" className="book7-form-message">
                    {message}
                  </p>
                )}
              </>
            ) : (
              <div className="book7-hint-info">
                교사 계정에서는 학생들의 완성된 앨범을 감상할 수 있어요. 사진 업로드는 학생 계정에서만 보여요.
              </div>
            )}
          </MacWindow>
        )}

        {noteWin && (
          <MacWindow
            win={noteWin}
            title={`${noteIsMine ? "내 소감" : noteOwnerName}.txt`}
            fileIcon={<Icon name="sticky_note_2" size={15} />}
            bodyClass="is-note"
            onClose={() => closeWin("note")}
            onMinimize={() => minimizeWin("note")}
            onZoom={() => toggleZoom("note")}
            onFocus={() => focusWin("note")}
            onDragStart={dragStart("note")}
            onDragMove={dragMove}
            onDragEnd={dragEnd}
          >
            {noteIsMine ? (
              <>
                <div className="book7-note-moods" role="group" aria-label="기분 고르기">
                  {MOODS.map((mood) => (
                    <button
                      key={mood}
                      type="button"
                      aria-pressed={noteMood === mood}
                      data-on={noteMood === mood}
                      onClick={() => setNoteMood(mood)}
                    >
                      {mood}
                    </button>
                  ))}
                </div>
                <textarea
                  className="book7-note-editor"
                  value={noteText}
                  maxLength={400}
                  placeholder="여름 앨범을 보고 느낀 점을 적어 보세요. 친구 작품 이야기도 좋아요!"
                  onChange={(event) => setNoteText(event.target.value)}
                />
                {noteMessage && <p className="book7-note-message">{noteMessage}</p>}
                <div className="book7-note-actions">
                  <span>{noteText.length}/400</span>
                  {myNote && (
                    <button type="button" className="book7-ghost" onClick={() => removeNote(user.uid)}>
                      바탕화면에서 치우기
                    </button>
                  )}
                  <button
                    type="button"
                    className="book7-primary is-compact"
                    disabled={!noteText.trim() || noteSaving}
                    onClick={submitNote}
                  >
                    <Icon name={noteSaving ? "hourglass_top" : "push_pin"} size={19} />
                    {noteSaving ? "붙이는 중…" : myNote ? "소감 고치기" : "바탕화면에 붙이기"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="book7-note-head">
                  <span aria-hidden>{activeNote?.mood ?? "📝"}</span>
                  <div>
                    <strong>{noteOwnerName}</strong>
                    <small>
                      {activeNote?.updatedAt
                        ? `${new Date(activeNote.updatedAt).getMonth() + 1}월 ${new Date(
                            activeNote.updatedAt
                          ).getDate()}일에 올림`
                        : "방금 올림"}
                    </small>
                  </div>
                </div>
                <p className="book7-note-read">{activeNote?.text}</p>
                <div className="book7-note-actions">
                  {role === "teacher" && activeNote && (
                    <button
                      type="button"
                      className="book7-ghost"
                      onClick={() => removeNote(activeNote.uid)}
                    >
                      이 소감 치우기
                    </button>
                  )}
                  <button type="button" className="book7-primary is-compact" onClick={() => openNote(user.uid)}>
                    <Icon name="edit_note" size={20} />
                    나도 소감 쓰기
                  </button>
                </div>
              </>
            )}
          </MacWindow>
        )}

        {bookWin && (
          <MacWindow
            win={bookWin}
            title={bookTitle}
            fileIcon={<Icon name="auto_stories" size={15} />}
            immersive={bookImmersive}
            bodyClass="is-book"
            bodyRef={bookBodyRef}
            onClose={() => {
              setBookImmersive(false);
              closeWin("book");
            }}
            onMinimize={() => minimizeWin("book")}
            onZoom={() => toggleZoom("book")}
            onFocus={() => focusWin("book")}
            onDragStart={dragStart("book")}
            onDragMove={dragMove}
            onDragEnd={dragEnd}
            toolbar={
              <div className="book7-book-toolbar">
                {bookTarget !== "class" && (
                  <button type="button" onClick={() => openBook("class")} className="book7-tool-btn">
                    <Icon name="auto_stories" size={18} />
                    학급 앨범
                  </button>
                )}
                <button type="button" onClick={() => openWin("folder")} className="book7-tool-btn">
                  <Icon name="folder_open" size={18} />
                  친구 작품 폴더
                </button>
                <button type="button" onClick={toggleBookFull} className="book7-tool-btn is-accent">
                  <Icon name={bookImmersive ? "fullscreen_exit" : "fullscreen"} size={18} />
                  {bookImmersive ? "전체 화면 끝내기" : "전체 화면으로 보기"}
                </button>
                <span className="book7-menubar-spacer" />
                <button
                  type="button"
                  aria-label="이전 페이지"
                  className="book7-round-btn"
                  onClick={() => bookRef.current?.pageFlip().flipPrev("bottom")}
                >
                  <Icon name="chevron_left" size={22} />
                </button>
                <span className="book7-page-count">
                  {Math.min(currentPage + 1, pageCount)} / {pageCount}
                </span>
                <button
                  type="button"
                  aria-label="다음 페이지"
                  className="book7-round-btn"
                  onClick={() => bookRef.current?.pageFlip().flipNext("bottom")}
                >
                  <Icon name="chevron_right" size={22} />
                </button>
              </div>
            }
          >
            <HTMLFlipBook
              key={`${bookTarget}-${bookPageW}`}
              ref={bookRef}
              className="book7-flipbook"
              style={{}}
              width={bookPageW}
              height={bookPageH}
              size="stretch"
              minWidth={Math.min(200, bookPageW)}
              maxWidth={bookPageW}
              minHeight={Math.min(260, bookPageH)}
              maxHeight={bookPageH}
              startPage={currentPage}
              drawShadow
              flippingTime={760}
              usePortrait
              startZIndex={0}
              autoSize
              maxShadowOpacity={0.38}
              showCover
              mobileScrollSupport
              clickEventForward
              useMouseEvents
              swipeDistance={24}
              showPageCorners
              disableFlipByClick={false}
              onFlip={(event) => {
                setCurrentPage(Number(event.data) || 0);
                playTurn();
              }}
            >
              <BookPage hard>
                <div className="book7-cover">
                  <span className="book7-cover-spine" aria-hidden />
                  <div className="book7-cover-frame">
                    <div className="book7-cover-sun" aria-hidden>
                      ☀
                    </div>
                    <p className="book7-cover-kicker">OUR SUMMER · 2026</p>
                    <div className="book7-cover-label">
                      <span>{bookTarget === "class" ? "CLASS COLLECTION" : "STUDENT EDITION"}</span>
                      <h3>
                        {bookTarget === "class" ? (
                          <>
                            우리 모둠
                            <br />
                            여름 앨범
                          </>
                        ) : (
                          <>
                            나의 여름
                            <br />
                            이야기
                          </>
                        )}
                      </h3>
                      <i aria-hidden />
                      <strong>{bookTarget === "class" ? currentClass?.name : selectedStudentName}</strong>
                    </div>
                    <p className="book7-cover-note">Pictures and stories from our sunny days</p>
                  </div>
                </div>
              </BookPage>
              {activeSubmissions.flatMap((submission) => {
                const name =
                  submission.displayName ||
                  memberMap.get(submission.uid)?.displayName ||
                  "우리 반 친구";
                const pages = [
                  { url: submission.page1URL, caption: submission.page1Caption },
                  { url: submission.page2URL, caption: submission.page2Caption },
                ];
                return pages.map((page, index) => (
                  <BookPage key={`${submission.uid}-${index}`}>
                    <div className="book7-page-photo">
                      <div className="book7-photo-mount">
                        <span className="book7-tape book7-tape-left" aria-hidden />
                        <span className="book7-tape book7-tape-right" aria-hidden />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={cacheBusted(page.url, submission.updatedAt)}
                          alt={`${name}의 여름 앨범 ${index + 1}쪽`}
                        />
                      </div>
                      <p className="book7-english-caption">
                        “{page.caption || "My wonderful summer memory."}”
                      </p>
                      <div className="book7-page-caption">
                        <span>{name}</span>
                        <span>{index + 1} / 2</span>
                      </div>
                    </div>
                  </BookPage>
                ));
              })}
              <BookPage hard>
                <div className="book7-cover book7-back-cover">
                  <span className="book7-cover-spine" aria-hidden />
                  <div className="book7-cover-frame flex flex-col items-center justify-center text-center">
                    <span className="text-5xl" aria-hidden>
                      ✦
                    </span>
                    <p className="mt-5 text-2xl font-black">
                      {bookTarget === "class" ? "우리의 여름 이야기" : `${selectedStudentName}의 이야기`}
                    </p>
                    <p className="mt-2 text-sm font-bold tracking-[0.24em] opacity-70">THE END</p>
                    <div className="book7-back-mark">JAM ENGLISH</div>
                  </div>
                </div>
              </BookPage>
            </HTMLFlipBook>
          </MacWindow>
        )}
      </div>

      {classes.length > 0 && (
        <div className="book7-dock-wrap">
          <div className="book7-dock" onPointerDown={(event) => event.stopPropagation()}>
            {dockItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className="book7-dock-item"
                data-active={item.active}
                onClick={item.onClick}
              >
                {item.art}
                <span className="book7-dock-tip">{item.label}</span>
              </button>
            ))}
            <span className="book7-dock-sep" aria-hidden />
            <button
              type="button"
              className="book7-dock-item"
              onClick={() => router.push("/dashboard")}
            >
              <span className="book7-dock-exit" aria-hidden>
                <Icon name="logout" size={24} />
              </span>
              <span className="book7-dock-tip">대시보드로 나가기</span>
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

export default function Book7Page() {
  return (
    <Suspense fallback={<main className="book7-os book7-os-boot" />}>
      <Book7Inner />
    </Suspense>
  );
}
