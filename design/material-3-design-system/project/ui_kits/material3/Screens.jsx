// Mail demo screens — read M3 components from window.
const { useState } = React;

/* Avatar circle */
function Avatar({ name, color }) {
  const initial = name.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: 40, height: 40, borderRadius: "50%",
      background: color || "var(--md-sys-color-tertiary-container)",
      color: "var(--md-sys-color-on-tertiary-container)",
      display: "flex", alignItems: "center", justifyContent: "center",
      font: "500 14px/1 var(--md-sys-font-plain)", letterSpacing: 0.1,
      flexShrink: 0,
    }}>{initial}</div>
  );
}

const SAMPLE_MAIL = [
  { id: 1, from: "Sandra Adams", color: "var(--md-sys-color-tertiary-container)", subject: "Brunch this weekend?",          preview: "I want to try that new place on Filbert St. — what time works for you?", time: "1:24 PM", unread: true,  starred: true,  folder: "inbox" },
  { id: 2, from: "Trevor Hansen", color: "var(--md-sys-color-secondary-container)", subject: "Material 3 token review",     preview: "Pushed the new tonal palette to the shared library. Let me know if anything reads wrong.", time: "11:02 AM", unread: true, folder: "inbox" },
  { id: 3, from: "Britta Holt",   color: "var(--md-sys-color-primary-container)",   subject: "Re: dinner Friday",            preview: "Yes! 7:30 at Liholiho works. I'll book a table.", time: "Yesterday", unread: false, folder: "inbox" },
  { id: 4, from: "Allison Trabuc",color: "var(--md-sys-color-error-container)",     subject: "Recipe — kimchi pancake",      preview: "Here's the version my mom sent. The trick is to let the batter rest for ten minutes.", time: "Mon", starred: true, folder: "inbox" },
  { id: 5, from: "Daniel Lee",    color: "var(--md-sys-color-tertiary-container)",  subject: "Weekly digest · Tuesday",      preview: "Three things to know before stand-up: outage post-mortem, new hires, Q3 OKRs.", time: "Mon", folder: "inbox" },
  { id: 6, from: "Coffee & Co.",  color: "var(--md-sys-color-secondary-container)", subject: "Your rewards summary",         preview: "You're 3 stars away from a free drink. Treat yourself this week.", time: "Sun", folder: "inbox" },
  { id: 7, from: "Kate Chen",     color: "var(--md-sys-color-primary-container)",   subject: "Photos from Tahoe",            preview: "Finally got around to editing these — link below. Let me know which ones to print.", time: "Mar 14", folder: "inbox" },
];

function MailList({ folder = "inbox", filter, search, onOpen, onStar }) {
  const filtered = SAMPLE_MAIL
    .filter(m => m.folder === folder)
    .filter(m => filter === "all" || (filter === "unread" && m.unread) || (filter === "starred" && m.starred))
    .filter(m => !search || (m.subject + m.from + m.preview).toLowerCase().includes(search.toLowerCase()));
  if (filtered.length === 0) {
    return (
      <div style={{ padding: 64, textAlign: "center", color: "var(--md-sys-color-on-surface-variant)" }}>
        <span className="material-symbols-outlined" style={{ fontSize: 48 }}>inbox</span>
        <p style={{ font: "500 16px/24px var(--md-sys-font-plain)", marginTop: 12 }}>No messages.</p>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "0 8px" }}>
      {filtered.map(m => (
        <ListItem key={m.id}
          leading={<Avatar name={m.from} color={m.color} />}
          headline={
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {m.unread && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--md-sys-color-primary)" }} />}
              <span style={{ fontWeight: m.unread ? 500 : 400 }}>{m.from}</span>
              <span style={{ marginLeft: "auto", font: "400 12px/16px var(--md-sys-font-plain)", letterSpacing: 0.4, color: "var(--md-sys-color-on-surface-variant)" }}>{m.time}</span>
            </span>
          }
          supporting={
            <span style={{ display: "block" }}>
              <span style={{ display: "block", fontWeight: m.unread ? 500 : 400, color: "var(--md-sys-color-on-surface)" }}>{m.subject}</span>
              <span style={{ display: "block", color: "var(--md-sys-color-on-surface-variant)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.preview}</span>
            </span>
          }
          trailing={
            <IconButton icon="star" selected={!!m.starred} onClick={(e) => { e?.stopPropagation?.(); onStar?.(m.id); }} />
          }
          onClick={() => onOpen?.(m)}
        />
      ))}
    </div>
  );
}

/* Mail detail view */
function MailDetail({ mail, onBack, onArchive, onDelete }) {
  if (!mail) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: 16, gap: 16, overflow: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <IconButton icon="arrow_back" onClick={onBack} />
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          <IconButton icon="archive" onClick={onArchive} />
          <IconButton icon="delete" onClick={onDelete} />
          <IconButton icon="mark_email_unread" />
          <IconButton icon="more_vert" />
        </div>
      </div>
      <h1 style={{ margin: 0, font: "400 28px/36px var(--md-sys-font-brand)", color: "var(--md-sys-color-on-surface)" }}>{mail.subject}</h1>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Avatar name={mail.from} color={mail.color} />
        <div style={{ flex: 1 }}>
          <div style={{ font: "500 14px/20px var(--md-sys-font-plain)", color: "var(--md-sys-color-on-surface)" }}>{mail.from}</div>
          <div style={{ font: "400 12px/16px var(--md-sys-font-plain)", color: "var(--md-sys-color-on-surface-variant)" }}>to me · {mail.time}</div>
        </div>
        <IconButton icon="reply" />
        <IconButton icon="star" selected={!!mail.starred} />
      </div>
      <p style={{ margin: 0, font: "400 16px/24px var(--md-sys-font-plain)", color: "var(--md-sys-color-on-surface)" }}>{mail.preview}</p>
      <p style={{ margin: 0, font: "400 16px/24px var(--md-sys-font-plain)", color: "var(--md-sys-color-on-surface)" }}>
        Let me know if any time tomorrow works for you. I can shift the call earlier or push it after lunch — whatever fits your day best.
      </p>
      <p style={{ margin: 0, font: "400 16px/24px var(--md-sys-font-plain)", color: "var(--md-sys-color-on-surface)" }}>Thanks,<br/>{mail.from.split(" ")[0]}</p>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <Button variant="tonal" icon="reply">Reply</Button>
        <Button variant="outlined" icon="forward">Forward</Button>
      </div>
    </div>
  );
}

/* Compose dialog content */
function Compose({ onCancel, onSend }) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, width: 480, maxWidth: "90vw" }}>
      <TextField label="To" value={to} onChange={setTo} leading="person" />
      <TextField label="Subject" value={subject} onChange={setSubject} />
      <TextField label="Message" value={body} onChange={setBody} multiline rows={6} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <IconButton icon="attach_file" title="Attach" />
        <IconButton icon="image" title="Insert image" />
        <IconButton icon="emoji_emotions" title="Emoji" />
        <div style={{ flex: 1 }} />
        <Button variant="text" onClick={onCancel}>Discard</Button>
        <Button variant="filled" icon="send" onClick={() => onSend?.({ to, subject, body })}>Send</Button>
      </div>
    </div>
  );
}

/* Settings screen */
function Settings() {
  const [t, setT] = useState({
    notifications: true,
    desktopBadge: false,
    autoArchive: true,
    swipeToDelete: false,
    smartReply: true,
    importance: 1,
    digest: "daily",
  });
  const SettingRow = ({ icon, title, sub, control }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 16px" }}>
      <span className="material-symbols-outlined" style={{ color: "var(--md-sys-color-on-surface-variant)" }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: "500 16px/24px var(--md-sys-font-plain)", letterSpacing: 0.15, color: "var(--md-sys-color-on-surface)" }}>{title}</div>
        {sub && <div style={{ font: "400 14px/20px var(--md-sys-font-plain)", letterSpacing: 0.25, color: "var(--md-sys-color-on-surface-variant)" }}>{sub}</div>}
      </div>
      {control}
    </div>
  );
  const SectionLabel = ({ children }) => (
    <div style={{ padding: "16px 24px 8px", font: "500 11px/16px var(--md-sys-font-plain)", letterSpacing: 0.5, textTransform: "uppercase", color: "var(--md-sys-color-primary)" }}>{children}</div>
  );
  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <SectionLabel>Notifications</SectionLabel>
      <SettingRow icon="notifications" title="Push notifications" sub="Get notified about new mail."
        control={<Switch checked={t.notifications} onChange={(v) => setT({ ...t, notifications: v })} />} />
      <SettingRow icon="circle_notifications" title="Show unread badge" sub="On your app icon and tab title."
        control={<Switch checked={t.desktopBadge} onChange={(v) => setT({ ...t, desktopBadge: v })} />} />

      <SectionLabel>Inbox</SectionLabel>
      <SettingRow icon="archive" title="Auto-archive after 30 days" sub="Older mail moves to Archive automatically."
        control={<Switch checked={t.autoArchive} onChange={(v) => setT({ ...t, autoArchive: v })} />} />
      <SettingRow icon="swipe_left" title="Swipe left to delete" sub="Otherwise swiping archives."
        control={<Switch checked={t.swipeToDelete} onChange={(v) => setT({ ...t, swipeToDelete: v })} />} />
      <SettingRow icon="bolt" title="Smart reply suggestions" sub="Quick reply chips below messages."
        control={<Switch checked={t.smartReply} onChange={(v) => setT({ ...t, smartReply: v })} />} />

      <SectionLabel>Filters</SectionLabel>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "0 24px 16px" }}>
        {["all", "unread", "starred", "important", "with attachments"].map(k => (
          <Chip key={k} selected={k === "unread"}>{k}</Chip>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { Avatar, MailList, MailDetail, Compose, Settings });
