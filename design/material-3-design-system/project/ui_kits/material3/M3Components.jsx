// Material 3 — small, reusable components.
// All shared on `window` so other Babel scripts can pick them up.

const { useState, useEffect, useRef, useCallback } = React;

/* ─────────────────────── Button ─────────────────────── */
function Button({ variant = "filled", icon, children, onClick, disabled, style }) {
  const styles = {
    filled:   { background: "var(--md-sys-color-primary)",           color: "var(--md-sys-color-on-primary)" },
    tonal:    { background: "var(--md-sys-color-secondary-container)", color: "var(--md-sys-color-on-secondary-container)" },
    elevated: { background: "var(--md-sys-color-surface-container-low)", color: "var(--md-sys-color-primary)", boxShadow: "var(--md-sys-elevation-1)" },
    outlined: { background: "transparent", color: "var(--md-sys-color-primary)", border: "1px solid var(--md-sys-color-outline)" },
    text:     { background: "transparent", color: "var(--md-sys-color-primary)", padding: "0 12px" },
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="m3-btn"
      style={{
        height: 40,
        padding: "0 24px",
        borderRadius: 9999,
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        font: "500 14px/1 var(--md-sys-font-plain)",
        letterSpacing: 0.1,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        whiteSpace: "nowrap",
        transition: "box-shadow 150ms cubic-bezier(0.2,0,0,1), background 150ms cubic-bezier(0.2,0,0,1)",
        opacity: disabled ? 0.38 : 1,
        ...styles[variant],
        ...style,
      }}>
      {icon && <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{icon}</span>}
      {children}
    </button>
  );
}

/* ─────────────────────── Icon button ─────────────────────── */
function IconButton({ icon, onClick, variant = "standard", selected = false, title, size = 40, fill = false }) {
  const palettes = {
    standard: selected
      ? { background: "transparent", color: "var(--md-sys-color-primary)" }
      : { background: "transparent", color: "var(--md-sys-color-on-surface-variant)" },
    filled:    { background: "var(--md-sys-color-primary)", color: "var(--md-sys-color-on-primary)" },
    tonal:     { background: "var(--md-sys-color-secondary-container)", color: "var(--md-sys-color-on-secondary-container)" },
    outlined:  { background: "transparent", color: "var(--md-sys-color-on-surface-variant)", border: "1px solid var(--md-sys-color-outline)" },
  };
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="m3-iconbtn"
      style={{
        width: size, height: size, borderRadius: 999,
        border: "none", cursor: "pointer",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
        ...palettes[variant],
      }}>
      <span className="material-symbols-outlined" style={{ fontSize: size === 40 ? 24 : Math.round(size * 0.55), fontVariationSettings: fill || selected ? '"FILL" 1' : '"FILL" 0' }}>{icon}</span>
    </button>
  );
}

/* ─────────────────────── FAB ─────────────────────── */
function FAB({ icon, label, size = "md", variant = "primary", onClick }) {
  const sizeMap = {
    sm: { w: 40, h: 40, r: 12, icon: 24 },
    md: { w: 56, h: 56, r: 16, icon: 24 },
    lg: { w: 96, h: 96, r: 28, icon: 36 },
  };
  const variantMap = {
    primary:   { background: "var(--md-sys-color-primary-container)",   color: "var(--md-sys-color-on-primary-container)" },
    secondary: { background: "var(--md-sys-color-secondary-container)", color: "var(--md-sys-color-on-secondary-container)" },
    tertiary:  { background: "var(--md-sys-color-tertiary-container)",  color: "var(--md-sys-color-on-tertiary-container)" },
    surface:   { background: "var(--md-sys-color-surface-container-high)", color: "var(--md-sys-color-primary)" },
  };
  const s = sizeMap[size];
  if (label) {
    return (
      <button type="button" onClick={onClick} style={{
        height: 56, padding: "0 20px", borderRadius: 16, border: "none",
        boxShadow: "var(--md-sys-elevation-3)", display: "inline-flex", alignItems: "center", gap: 12, cursor: "pointer",
        font: "500 14px/1 var(--md-sys-font-plain)", letterSpacing: 0.1,
        ...variantMap[variant],
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: 24 }}>{icon}</span>
        {label}
      </button>
    );
  }
  return (
    <button type="button" onClick={onClick} style={{
      width: s.w, height: s.h, borderRadius: s.r, border: "none",
      boxShadow: "var(--md-sys-elevation-3)", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
      ...variantMap[variant],
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: s.icon }}>{icon}</span>
    </button>
  );
}

/* ─────────────────────── Chip ─────────────────────── */
function Chip({ children, selected, icon, onClick, onDelete, variant = "filter" }) {
  const palettes = {
    filter: selected
      ? { background: "var(--md-sys-color-secondary-container)", color: "var(--md-sys-color-on-secondary-container)", border: "1px solid transparent" }
      : { background: "transparent", color: "var(--md-sys-color-on-surface-variant)", border: "1px solid var(--md-sys-color-outline)" },
    assist: { background: "transparent", color: "var(--md-sys-color-on-surface)", border: "1px solid var(--md-sys-color-outline)" },
    input:  { background: "var(--md-sys-color-secondary-container)", color: "var(--md-sys-color-on-secondary-container)", border: "1px solid transparent" },
  };
  return (
    <button type="button" onClick={onClick} style={{
      height: 32, padding: selected ? "0 16px 0 8px" : "0 16px",
      borderRadius: 8, cursor: "pointer",
      font: "500 14px/1 var(--md-sys-font-plain)", letterSpacing: 0.1,
      display: "inline-flex", alignItems: "center", gap: 8,
      ...palettes[variant],
    }}>
      {selected && variant === "filter" && <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check</span>}
      {icon && !selected && <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{icon}</span>}
      {children}
      {onDelete && <span className="material-symbols-outlined" style={{ fontSize: 18, opacity: 0.6, marginLeft: 4 }} onClick={(e) => { e.stopPropagation(); onDelete(); }}>close</span>}
    </button>
  );
}

/* ─────────────────────── Switch ─────────────────────── */
function Switch({ checked, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange?.(!checked)} style={{
      width: 52, height: 32, borderRadius: 999, padding: 4, border: "2px solid",
      borderColor: checked ? "var(--md-sys-color-primary)" : "var(--md-sys-color-outline)",
      background: checked ? "var(--md-sys-color-primary)" : "var(--md-sys-color-surface-container-highest)",
      display: "inline-flex", alignItems: "center", cursor: "pointer",
      transition: "all 200ms cubic-bezier(0.2,0,0,1)",
    }}>
      <span style={{
        width: checked ? 24 : 16, height: checked ? 24 : 16, borderRadius: "50%",
        background: checked ? "var(--md-sys-color-on-primary)" : "var(--md-sys-color-outline)",
        transform: checked ? "translateX(20px)" : "translateX(0)",
        transition: "all 200ms cubic-bezier(0.2,0,0,1)",
      }} />
    </button>
  );
}

/* ─────────────────────── Checkbox ─────────────────────── */
function Checkbox({ checked, onChange }) {
  return (
    <button type="button" onClick={() => onChange?.(!checked)} style={{
      width: 18, height: 18, borderRadius: 2,
      border: "2px solid", borderColor: checked ? "var(--md-sys-color-primary)" : "var(--md-sys-color-on-surface-variant)",
      background: checked ? "var(--md-sys-color-primary)" : "transparent",
      display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0,
    }}>
      {checked && <span className="material-symbols-outlined" style={{ fontSize: 16, color: "var(--md-sys-color-on-primary)" }}>check</span>}
    </button>
  );
}

/* ─────────────────────── Text field (outlined) ─────────────────────── */
function TextField({ label, value, onChange, type = "text", multiline = false, rows = 4, leading, trailing }) {
  const [focused, setFocused] = useState(false);
  const filled = value && value.length > 0;
  const float = focused || filled;
  const InputTag = multiline ? "textarea" : "input";
  return (
    <div style={{
      position: "relative", display: "flex", alignItems: multiline ? "flex-start" : "center", gap: 12,
      border: focused ? "2px solid var(--md-sys-color-primary)" : "1px solid var(--md-sys-color-outline)",
      borderRadius: 4,
      padding: multiline ? "16px" : (focused ? "13px 15px" : "14px 16px"),
      background: "var(--md-sys-color-surface)",
      transition: "border-color 100ms",
    }}>
      {leading && <span className="material-symbols-outlined" style={{ color: "var(--md-sys-color-on-surface-variant)" }}>{leading}</span>}
      <span style={{
        position: "absolute",
        top: float ? -8 : (multiline ? 16 : "50%"),
        left: leading ? 44 : 12,
        transform: float ? "none" : (multiline ? "none" : "translateY(-50%)"),
        background: "var(--md-sys-color-surface)",
        padding: "0 4px",
        font: float ? "500 12px/1 var(--md-sys-font-plain)" : "400 16px/1 var(--md-sys-font-plain)",
        color: focused ? "var(--md-sys-color-primary)" : "var(--md-sys-color-on-surface-variant)",
        letterSpacing: 0.4,
        pointerEvents: "none",
        transition: "all 150ms cubic-bezier(0.2,0,0,1)",
      }}>{label}</span>
      <InputTag
        type={type}
        rows={multiline ? rows : undefined}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          flex: 1, border: "none", outline: "none", background: "transparent",
          font: "400 16px/1.4 var(--md-sys-font-plain)", letterSpacing: 0.5,
          color: "var(--md-sys-color-on-surface)", padding: 0, minWidth: 0, resize: "vertical",
          minHeight: multiline ? `${rows * 22}px` : undefined,
        }}
      />
      {trailing && <span className="material-symbols-outlined" style={{ color: "var(--md-sys-color-on-surface-variant)" }}>{trailing}</span>}
    </div>
  );
}

/* ─────────────────────── List item ─────────────────────── */
function ListItem({ leading, headline, supporting, trailing, onClick, active }) {
  const [hover, setHover] = useState(false);
  return (
    <button type="button" onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 16,
        padding: "12px 16px", textAlign: "left", width: "100%",
        background: active ? "var(--md-sys-color-secondary-container)" : (hover ? "color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent)" : "transparent"),
        border: "none", borderRadius: 12, cursor: "pointer", color: "inherit",
        transition: "background 100ms",
      }}>
      {leading}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ font: "500 16px/24px var(--md-sys-font-plain)", letterSpacing: 0.15, color: "var(--md-sys-color-on-surface)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{headline}</span>
        {supporting && <span style={{ font: "400 14px/20px var(--md-sys-font-plain)", letterSpacing: 0.25, color: "var(--md-sys-color-on-surface-variant)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{supporting}</span>}
      </div>
      {trailing}
    </button>
  );
}

/* ─────────────────────── Card ─────────────────────── */
function Card({ variant = "elevated", children, style, onClick }) {
  const v = {
    filled:   { background: "var(--md-sys-color-surface-container-highest)" },
    elevated: { background: "var(--md-sys-color-surface-container-low)", boxShadow: "var(--md-sys-elevation-1)" },
    outlined: { background: "var(--md-sys-color-surface)", border: "1px solid var(--md-sys-color-outline-variant)" },
  };
  return (
    <div onClick={onClick} style={{ borderRadius: 12, padding: 16, ...v[variant], ...style, cursor: onClick ? "pointer" : "default" }}>
      {children}
    </div>
  );
}

/* ─────────────────────── Dialog ─────────────────────── */
function Dialog({ open, onClose, title, icon, children, actions }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.32)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
      animation: "m3-fade 200ms cubic-bezier(0.2,0,0,1)",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 360, maxWidth: "90vw",
        background: "var(--md-sys-color-surface-container-high)",
        borderRadius: 28, padding: 24,
        boxShadow: "var(--md-sys-elevation-3)",
        animation: "m3-rise 250ms cubic-bezier(0.05,0.7,0.1,1)",
      }}>
        {icon && (
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24, color: "var(--md-sys-color-secondary)" }}>{icon}</span>
          </div>
        )}
        <h2 style={{ margin: 0, font: "400 24px/32px var(--md-sys-font-brand)", color: "var(--md-sys-color-on-surface)", textAlign: icon ? "center" : "left" }}>{title}</h2>
        <div style={{ marginTop: 16, font: "400 14px/20px var(--md-sys-font-plain)", letterSpacing: 0.25, color: "var(--md-sys-color-on-surface-variant)" }}>{children}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 24 }}>{actions}</div>
      </div>
    </div>
  );
}

/* ─────────────────────── Snackbar ─────────────────────── */
function Snackbar({ message, action, onAction, open }) {
  if (!open) return null;
  return (
    <div style={{
      position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
      display: "flex", alignItems: "center", gap: 8, padding: "6px 8px 6px 16px",
      background: "var(--md-sys-color-inverse-surface)", color: "var(--md-sys-color-inverse-on-surface)",
      borderRadius: 4, boxShadow: "var(--md-sys-elevation-3)", minWidth: 280, maxWidth: 480,
      font: "400 14px/20px var(--md-sys-font-plain)", letterSpacing: 0.25, zIndex: 200,
      animation: "m3-rise 250ms cubic-bezier(0.05,0.7,0.1,1)",
    }}>
      <span style={{ flex: 1, padding: "8px 0" }}>{message}</span>
      {action && (
        <button type="button" onClick={onAction} style={{
          background: "transparent", border: "none", padding: "8px 12px",
          font: "500 14px/1 var(--md-sys-font-plain)", color: "var(--md-sys-color-inverse-primary)",
          cursor: "pointer", borderRadius: 4,
        }}>{action}</button>
      )}
    </div>
  );
}

/* ─────────────────────── Search bar ─────────────────────── */
function SearchBar({ value, onChange, placeholder = "Search mail", leading, trailing }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      height: 56, padding: "0 8px 0 4px", borderRadius: 28,
      background: "var(--md-sys-color-surface-container-high)",
    }}>
      <IconButton icon={leading || "menu"} />
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
        style={{
          flex: 1, border: "none", outline: "none", background: "transparent",
          font: "400 16px/1 var(--md-sys-font-plain)", letterSpacing: 0.5,
          color: "var(--md-sys-color-on-surface)",
        }}
      />
      {trailing}
    </div>
  );
}

/* Animations */
const styleEl = document.createElement("style");
styleEl.textContent = `
@keyframes m3-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes m3-rise { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
.m3-iconbtn:hover { background: color-mix(in srgb, currentColor 8%, transparent) !important; }
.m3-btn:hover { box-shadow: var(--md-sys-elevation-1); }
`;
document.head.appendChild(styleEl);

Object.assign(window, { Button, IconButton, FAB, Chip, Switch, Checkbox, TextField, ListItem, Card, Dialog, Snackbar, SearchBar });
