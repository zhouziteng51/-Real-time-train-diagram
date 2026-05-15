---
name: Metro Dispatch System
colors:
  surface: '#fff8f7'
  surface-dim: '#f6d2cd'
  surface-bright: '#fff8f7'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#fff0ee'
  surface-container: '#ffe9e6'
  surface-container-high: '#ffe2de'
  surface-container-highest: '#ffdad5'
  on-surface: '#2a1614'
  on-surface-variant: '#5f3f3b'
  inverse-surface: '#412b28'
  inverse-on-surface: '#ffedea'
  outline: '#946e69'
  outline-variant: '#e9bcb6'
  surface-tint: '#c0000d'
  primary: '#b7000c'
  on-primary: '#ffffff'
  primary-container: '#e60012'
  on-primary-container: '#fff7f6'
  inverse-primary: '#ffb4aa'
  secondary: '#175ead'
  on-secondary: '#ffffff'
  secondary-container: '#72aafe'
  on-secondary-container: '#003d79'
  tertiary: '#0058b2'
  on-tertiary: '#ffffff'
  tertiary-container: '#0070e0'
  on-tertiary-container: '#f9f8ff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdad5'
  primary-fixed-dim: '#ffb4aa'
  on-primary-fixed: '#410001'
  on-primary-fixed-variant: '#930007'
  secondary-fixed: '#d5e3ff'
  secondary-fixed-dim: '#a8c8ff'
  on-secondary-fixed: '#001b3c'
  on-secondary-fixed-variant: '#004689'
  tertiary-fixed: '#d7e3ff'
  tertiary-fixed-dim: '#abc7ff'
  on-tertiary-fixed: '#001b3f'
  on-tertiary-fixed-variant: '#00458f'
  background: '#fff8f7'
  on-background: '#2a1614'
  surface-variant: '#ffdad5'
typography:
  display-sm:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  title-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  data-mono:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  touch-target: 48px
  margin-mobile: 16px
  gutter-mobile: 12px
---

## Brand & Style
The design system is engineered for high-stakes industrial environments where clarity and speed of recognition are paramount. The brand personality is **authoritative and utilitarian**, reflecting the precision required in metro operations. 

It utilizes a **Corporate Modern** style that blends the structured density of enterprise software with the immediate legibility of emergency response interfaces. The aesthetic prioritizes function over decoration, using a stark light theme to ensure maximum contrast under varying light conditions (cab interiors, outdoor platforms, and dimly lit tunnels). The design language communicates stability and safety through a disciplined grid and a high-visibility primary palette.

## Colors
The color palette is led by **Xuzhou Metro Red (#E60012)**, utilized strategically for primary actions, branding, and critical alerts to ensure high visibility. A tech-inspired **Railway Blue (#0055A4)** serves as a secondary accent for navigational elements and non-critical interactive components.

Backgrounds utilize **Pure White (#FFFFFF)** for primary content surfaces and **Cool Gray (#F8FAFC)** for layout grouping to reduce ocular fatigue. Status colors are strictly enforced: **Green (#10B981)** denotes "Normal/Running" operations, while **Orange (#F59E0B)** indicates "Pending/History" or cautionary states. High-contrast Slate (#0F172A) is used for all primary legibility, ensuring the UI remains accessible under vibration or stress.

## Typography
This design system uses **Inter** as the primary typeface for its exceptional legibility at small sizes and neutral, professional tone. A secondary monospaced font (**JetBrains Mono**) is introduced specifically for "Data-Mono" roles, such as Train ID numbers, timestamps, and GPS coordinates, ensuring characters like '0' and 'O' are never confused.

Information density is managed through a strict hierarchy: Large headings for station names and terminal status, while tabular data and secondary metadata use smaller, high-weight labels. Line heights are slightly increased to prevent text blurring during device vibration.

## Layout & Spacing
The layout follows a **Fluid Grid** model optimized for mobile handsets and ruggedized tablets. It utilizes a 4-column system for mobile viewports with a 16px outer margin. 

A "Safe-Touch" philosophy is applied: all interactive elements must maintain a minimum hit area of **48x48px** to accommodate drivers wearing gloves or operating the device in motion. Spacing follows a 4px baseline grid, with 16px (md) being the standard padding for card containers and 8px (sm) for internal element grouping.

## Elevation & Depth
The design system employs **Tonal Layers** and **Low-Contrast Outlines** to define hierarchy, minimizing the use of complex shadows which can wash out in high-brightness environments. 

1.  **Base Layer:** Cool Gray (#F8FAFC) background.
2.  **Card Layer:** White (#FFFFFF) surfaces with a 1px border (#E2E8F0) and a `shadow-sm` (4px blur, 2% opacity black) to provide subtle separation.
3.  **Active/Modal Layer:** Higher elevation with a `shadow-md` and a semi-transparent backdrop blur (8px) for overlays, ensuring the driver's focus is locked on the immediate task (e.g., an incoming dispatch).

## Shapes
The design system adopts a **Soft (1)** roundedness profile. A 0.25rem (4px) radius is used for input fields and small buttons, while cards and primary action containers use a 0.5rem (8px) `rounded-lg` radius. This subtle rounding maintains a professional, industrial feel while appearing more modern and accessible than sharp corners. Large action buttons (like "Start Trip") may use a 0.75rem radius to distinguish them from informational cards.

## Components
- **Primary Buttons:** High-contrast Metro Red backgrounds with White text. Minimum height of 48px. 
- **Status Chips:** Used for "On Time," "Delayed," or "At Station." Uses light tinted backgrounds (10% opacity of status color) with high-contrast bold text of the same hue.
- **Dispatch Cards:** The core component. Includes a 4px left-border accent colored by status (Red/Green/Orange), containing the Route ID, Time, and Destination.
- **Input Fields:** Large, clear borders (#CBD5E1) that thicken and change to Railway Blue (#0055A4) on focus. Labels are always visible above the field (no floating labels) to ensure context is never lost.
- **Segmented Control:** Used for toggling between "Active Tasks," "Schedule," and "Map." These use a light gray background with a white "sliding" active state.
- **List Items:** High-density rows with 16px vertical padding, separated by 1px dividers, featuring a chevron-right for navigation.