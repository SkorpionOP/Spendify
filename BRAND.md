# Spendify — Brand & Design System
> Generated via UI/UX Pro Max Skill · Style: **Mature Fintech · Dark Mode First (OLED)**  
> Aesthetic reference: Qonto, Wealthsimple, Revolut

---

## 1. Brand Identity

| Property | Value |
|---------|-------|
| **Product Name** | Spendify |
| **Tagline** | *Financial Clarity, Redefined* |
| **Category** | Personal Finance / Expense Intelligence |
| **Tone** | Confident, Premium, No-Nonsense |
| **Personality** | Sharp · Trustworthy · Calm · Intelligent |

---

## 2. Color System

### Core Palette (Dark Mode First)

```css
:root {
  /* ── Brand ── */
  --brand-emerald:       #10b981;   /* Primary CTA, growth signals, positive values */
  --brand-emerald-light: #34d399;   /* Hover / glow states */
  --brand-emerald-dim:   rgba(16, 185, 129, 0.15);
  --brand-emerald-glow:  rgba(16, 185, 129, 0.4);

  --brand-indigo:        #6366f1;   /* Secondary actions, charts, info */
  --brand-violet:        #8b5cf6;   /* Tertiary accents, tags */
  --brand-amber:         #f59e0b;   /* Warning, pending, budget alerts */

  /* ── Backgrounds (OLED-optimised) ── */
  --bg-base:             #02020a;   /* True dark — OLED black */
  --bg-surface:          #05050f;   /* Page body */
  --bg-card:             rgba(12, 12, 26, 0.55);   /* Glass cards */
  --bg-card-elevated:    rgba(18, 18, 38, 0.75);   /* Raised cards */
  --bg-overlay:          rgba(2,   2,  10, 0.85);  /* Nav / modal */

  /* ── Text ── */
  --text-primary:   #f0f4ff;        /* Body text — not pure white (eye comfort) */
  --text-secondary: #94a3b8;        /* Labels, subtitles */
  --text-muted:     #64748b;        /* Timestamps, metadata */
  --text-disabled:  #374151;

  /* ── Functional ── */
  --color-success:  #10b981;
  --color-danger:   #ef4444;
  --color-warning:  #f59e0b;
  --color-info:     #3b82f6;

  /* ── Borders & Glass ── */
  --border-subtle: rgba(255, 255, 255, 0.06);
  --border-light:  rgba(255, 255, 255, 0.10);
  --border-hover:  rgba(16,  185, 129, 0.35);
  --glass-blur:    blur(24px) saturate(200%);
}
```

### Semantic Colour Rules

| Situation | Color Token | Example |
|-----------|-------------|---------|
| Positive / growth | `--brand-emerald` | Budget surplus, savings ↑ |
| Danger / overspend | `--color-danger` | Over-budget, delete actions |
| Warning / near-limit | `--color-warning` | 80%+ budget used |
| Neutral action | `--brand-indigo` | Primary buttons (non-financial) |
| Data / analytics | `--brand-violet` | Chart elements, badges |

---

## 3. Typography

### Pairing
| Role | Font | Weight | Usage |
|------|------|--------|-------|
| **Display** | Plus Jakarta Sans | 800 | Hero headlines, stat values |
| **Heading** | Plus Jakarta Sans | 700 | Section titles, card headers |
| **Body** | DM Sans | 400 / 500 | Body text, descriptions |
| **Label** | Plus Jakarta Sans | 700 | Uppercase labels, badges |
| **Mono** | System mono | 500 | Transaction amounts |

```css
/* Google Fonts Import */
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&display=swap');

/* Type Scale */
--text-display:  clamp(2.8rem, 5vw, 4.2rem);   /* Hero H1 */
--text-title-xl: clamp(2rem,   4vw, 3rem);      /* Section H2 */
--text-title-lg: clamp(1.4rem, 3vw, 2rem);      /* Card titles */
--text-body-lg:  1.05rem;
--text-body:     0.9rem;
--text-small:    0.78rem;
--text-xs:       0.68rem;

/* Letter spacing */
--tracking-tight:  -0.04em;   /* Display text */
--tracking-normal: -0.02em;   /* Headings */
--tracking-wide:   0.08em;    /* Uppercase labels */
```

---

## 4. Spacing & Radius

```css
/* Spacing scale (8px base) */
--space-1:  0.25rem;   /*  4px */
--space-2:  0.5rem;    /*  8px */
--space-3:  0.75rem;   /* 12px */
--space-4:  1rem;      /* 16px */
--space-6:  1.5rem;    /* 24px */
--space-8:  2rem;      /* 32px */
--space-12: 3rem;      /* 48px */
--space-16: 4rem;      /* 64px */

/* Border Radius */
--radius-full: 99px;   /* Pills, dots */
--radius-xl:   24px;   /* Main cards, modals */
--radius-lg:   18px;   /* Glass cards */
--radius-md:   12px;   /* Buttons, inputs */
--radius-sm:   8px;    /* Tags, small chips */
```

---

## 5. Glassmorphism System

```css
/* Standard glass card */
.glass-card {
  background: linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%),
              rgba(12, 12, 26, 0.55);
  backdrop-filter: blur(24px) saturate(200%);
  -webkit-backdrop-filter: blur(24px) saturate(200%);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 18px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 32px rgba(0,0,0,0.25);
}

/* Elevated glass (dialogs, floating panels) */
.glass-elevated {
  background: rgba(10, 14, 24, 0.80);
  backdrop-filter: blur(32px) saturate(220%);
  border: 1px solid rgba(255, 255, 255, 0.10);
  box-shadow: 0 32px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.09);
}
```

---

## 6. Motion & Animation

```css
/* Easing curves */
--ease-out-expo:   cubic-bezier(0.19, 1, 0.22, 1);
--ease-spring:     cubic-bezier(0.175, 0.885, 0.32, 1.275);
--ease-standard:   cubic-bezier(0.4, 0, 0.2, 1);

/* Duration scale */
--duration-fast:   150ms;   /* Micro: hover color, opacity */
--duration-normal: 300ms;   /* Standard: panel open, card hover */
--duration-slow:   600ms;   /* Page transitions, reveals */
--duration-xslow:  1500ms;  /* Chart draws, progress fills */

/* Entry animations */
@keyframes fadeUp      { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
@keyframes scaleIn     { from { opacity:0; transform:scale(0.92); } to { opacity:1; transform:scale(1); } }
@keyframes floatCard   { 0%,100% { transform:translateY(0) rotate(-0.5deg); } 50% { transform:translateY(-12px) rotate(0.5deg); } }
@keyframes pulseGlow   { 0%,100% { box-shadow:0 0 0 0 rgba(16,185,129,0.5); } 50% { box-shadow:0 0 0 12px rgba(16,185,129,0); } }

/* Always respect user preference */
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }
```

---

## 7. Component Tokens

### Buttons
```css
/* Primary CTA (growth / confirm) */
.btn-emerald {
  background: linear-gradient(135deg, #10b981, #059669);
  color: #fff;
  box-shadow: 0 8px 32px rgba(16,185,129,0.35), inset 0 1px 0 rgba(255,255,255,0.2);
}
.btn-emerald:hover { box-shadow: 0 16px 48px rgba(16,185,129,0.5); transform: translateY(-2px); }

/* Ghost / secondary */
.btn-ghost {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.75);
}
```

### Badges
```css
/* Positive category pill */
.badge-emerald { background:rgba(16,185,129,0.12); border:1px solid rgba(16,185,129,0.25); color:#34d399; }
/* Neutral category pill */
.badge-indigo  { background:rgba(99,102,241,0.12); border:1px solid rgba(99,102,241,0.25); color:#818cf8; }
/* Warning pill */
.badge-amber   { background:rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.25); color:#fbbf24; }
```

---

## 8. Tailwind Config Tokens

```js
// tailwind.config.js — Spendify design tokens
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          emerald:  '#10b981',
          'emerald-light': '#34d399',
          indigo:   '#6366f1',
          violet:   '#8b5cf6',
          amber:    '#f59e0b',
        },
        surface: {
          base:     '#02020a',
          page:     '#05050f',
          card:     'rgba(12,12,26,0.55)',
          elevated: 'rgba(18,18,38,0.75)',
        },
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'sans-serif'],
        body:    ['"DM Sans"',           'sans-serif'],
      },
      fontSize: {
        'display': ['clamp(2.8rem, 5vw, 4.2rem)', { lineHeight: '1.08', letterSpacing: '-0.04em', fontWeight: '800' }],
        'title-xl': ['clamp(2rem, 4vw, 3rem)', { lineHeight: '1.1', letterSpacing: '-0.03em' }],
      },
      borderRadius: {
        'card': '18px',
        'xl2': '24px',
      },
      backdropBlur: { 'glass': '24px' },
      animation: {
        'float-card': 'floatCard 4s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'fade-up':    'fadeUp 0.7s ease-out both',
      },
      keyframes: {
        floatCard: {
          '0%, 100%': { transform: 'translateY(0) rotate(-0.5deg)' },
          '50%':       { transform: 'translateY(-12px) rotate(0.5deg)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(16,185,129,0.5)' },
          '50%':       { boxShadow: '0 0 0 12px rgba(16,185,129,0)' },
        },
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(24px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
      boxShadow: {
        'glass-card': 'inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 32px rgba(0,0,0,0.25)',
        'emerald-glow': '0 0 30px rgba(16,185,129,0.4)',
        'emerald-glow-lg': '0 16px 48px rgba(16,185,129,0.5)',
      },
    },
  },
}
```

---

## 9. UX Rules (Bento Box Dashboard)

| Rule | Implementation |
|------|---------------|
| **Cognitive Load** | Max 4 stats in top row. Hide secondary metrics behind expand. |
| **Thumb Zone** | All primary actions in bottom 40% of screen on mobile (44×44px min touch target). |
| **Focus Mode** | Single-tap hides all sections except "Week Remaining Budget" callout card. |
| **Color Signal** | Green = good, Amber = caution (>80%), Red = over-budget. Never reversed. |
| **Data Density** | Use Bento cards: each card communicates exactly ONE insight. |
| **Motion** | Entry animations ≤ 700ms. No looping animations on data-critical elements. |
| **Empty State** | Show a guided illustration + CTA when 0 transactions, never a blank page. |

---

## 10. Icon System

Use **Lucide Icons** (SVG inline, 24×24 viewBox, stroke-width 1.75–2).  
Never use emoji as UI icons.  
Icon sizes: 16px (inline labels), 20px (cards), 24px (nav), 28px (hero).

---

*Last updated: April 2026 · Maintained by Spendify team*
