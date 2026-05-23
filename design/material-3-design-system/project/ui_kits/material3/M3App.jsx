// Root app: nav rail + top bar + content area + FAB + dialogs/snackbars
const { useState } = React;

function NavRailItem({ icon, label, active, onClick }) {
  return (
    <button type="button" onClick={onClick} style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
      padding: "12px 0", width: "100%", border: "none", background: "transparent", cursor: "pointer",
      color: active ? "var(--md-sys-color-on-surface)" : "var(--md-sys-color-on-surface-variant)",
    }}>
      <span style={{
        height: 32, width: 56, borderRadius: 999,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: active ? "var(--md-sys-color-secondary-container)" : "transparent",
        transition: "background 200ms cubic-bezier(0.2,0,0,1)",
      }}>
        <span className="material-symbols-outlined" style={{
          fontSize: 24,
          color: active ? "var(--md-sys-color-on-secondary-container)" : "var(--md-sys-color-on-surface-variant)",
          fontVariationSettings: active ? '"FILL" 1' : '"FILL" 0',
        }}>{icon}</span>
      </span>
      <span style={{ font: "500 12px/16px var(--md-sys-font-plain)", letterSpacing: 0.5 }}>{label}</span>
    </button>
  );
}

function NavRail({ active, onChange, onCompose }) {
  const items = [
    { id: "inbox",   icon: "inbox",       label: "Inbox" },
    { id: "starred", icon: "star",        label: "Starred" },
    { id: "sent",    icon: "send",        label: "Sent" },
    { id: "drafts",  icon: "draft",       label: "Drafts" },
    { id: "settings",icon: "settings",    label: "Settings" },
  ];
  return (
    <div style={{
      width: 88, background: "var(--md-sys-color-surface)",
      borderRight: "1px solid var(--md-sys-color-outline-variant)",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "12px 0", gap: 16, flexShrink: 0,
    }}>
      <IconButton icon="menu" />
      <FAB icon="edit" variant="primary" onClick={onCompose} />
      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
        {items.map(i => (
          <NavRailItem key={i.id} icon={i.icon} label={i.label} active={active === i.id} onClick={() => onChange(i.id)} />
        ))}
      </div>
    </div>
  );
}

function M3App() {
  const [active, setActive]     = useState("inbox");
  const [filter, setFilter]     = useState("all");
  const [search, setSearch]     = useState("");
  const [open, setOpen]         = useState(null);    // opened mail
  const [composing, setComposing] = useState(false);
  const [confirm, setConfirm]   = useState(false);   // delete confirmation
  const [snack, setSnack]       = useState(null);
  const [stars, setStars]       = useState({ 1: true, 4: true });

  const showSnack = (message, action) => setSnack({ message, action });

  return (
    <div data-screen-label="Mail · Inbox" style={{
      height: "100vh", display: "flex",
      background: "var(--md-sys-color-surface)",
      color: "var(--md-sys-color-on-surface)",
      font: "400 16px/24px var(--md-sys-font-plain)",
    }}>
      <NavRail active={active} onChange={(id) => { setActive(id); setOpen(null); }} onCompose={() => setComposing(true)} />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Top app bar */}
        <div style={{ padding: 16 }}>
          {active === "inbox" || active === "starred" || active === "sent" || active === "drafts" ? (
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder={`Search ${active}`}
              trailing={<Avatar name="You" color="var(--md-sys-color-primary-container)" />}
            />
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "0 4px" }}>
              <h1 style={{ margin: 0, flex: 1, font: "400 28px/36px var(--md-sys-font-brand)", color: "var(--md-sys-color-on-surface)" }}>Settings</h1>
              <IconButton icon="search" />
              <IconButton icon="more_vert" />
            </div>
          )}
        </div>

        {/* Filter chips */}
        {(active === "inbox" || active === "starred") && !open && (
          <div style={{ display: "flex", gap: 8, padding: "0 24px 8px" }}>
            <Chip selected={filter === "all"}     onClick={() => setFilter("all")}>All</Chip>
            <Chip selected={filter === "unread"}  onClick={() => setFilter("unread")}>Unread</Chip>
            <Chip selected={filter === "starred"} onClick={() => setFilter("starred")}>Starred</Chip>
            <Chip icon="event">Today</Chip>
            <Chip icon="attach_file">Attachments</Chip>
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {active === "settings" ? <Settings /> :
           open ? (
             <MailDetail
               mail={{ ...open, starred: stars[open.id] }}
               onBack={() => setOpen(null)}
               onArchive={() => { setOpen(null); showSnack("Conversation archived", "Undo"); }}
               onDelete={() => setConfirm(true)}
             />
           ) :
           (active === "inbox" || active === "starred") ? (
             <MailList
               folder="inbox"
               filter={active === "starred" ? "starred" : filter}
               search={search}
               onOpen={(m) => setOpen({ ...m, starred: stars[m.id] })}
               onStar={(id) => setStars(s => ({ ...s, [id]: !s[id] }))}
             />
           ) : (
             <div style={{ padding: 64, textAlign: "center", color: "var(--md-sys-color-on-surface-variant)" }}>
               <span className="material-symbols-outlined" style={{ fontSize: 48 }}>{active === "sent" ? "send" : "draft"}</span>
               <p style={{ font: "500 16px/24px var(--md-sys-font-plain)", marginTop: 12 }}>Nothing in {active}.</p>
               <Button variant="text" onClick={() => setActive("inbox")}>Back to inbox</Button>
             </div>
           )}
        </div>
      </div>

      {/* Compose dialog */}
      <Dialog
        open={composing}
        onClose={() => setComposing(false)}
        title="New message"
        actions={null}
      >
        <Compose
          onCancel={() => setComposing(false)}
          onSend={() => { setComposing(false); showSnack("Message sent", null); }}
        />
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Delete this conversation?"
        icon="delete"
        actions={(
          <>
            <Button variant="text" onClick={() => setConfirm(false)}>Cancel</Button>
            <Button variant="filled" onClick={() => { setConfirm(false); setOpen(null); showSnack("Conversation deleted", "Undo"); }}>Delete</Button>
          </>
        )}
      >
        This conversation will be moved to Trash. You can restore it from there within 30 days.
      </Dialog>

      <Snackbar
        open={!!snack}
        message={snack?.message}
        action={snack?.action}
        onAction={() => setSnack(null)}
      />
      {snack && setTimeout(() => setSnack(null), 4000) && null}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<M3App />);
