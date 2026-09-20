# CertXA Professional Design System

## Overview
This design system defines the visual language and component library for CertXA's professional, Vagaro-inspired redesign. It establishes consistency, scalability, and maintainability across the platform.

## Design Principles

### 1. Professional First
- Clean, business-focused aesthetic
- Trustworthy and reliable visual language
- Industry-standard design patterns

### 2. User-Centered
- Clear information hierarchy
- Intuitive navigation and interactions
- Accessible to all users

### 3. Consistent & Scalable
- Systematic approach to design decisions
- Reusable components and patterns
- Maintainable codebase

## Color System

### Primary Colors
```css
--primary-blue: #1E40AF;      /* Main brand color, CTAs, links */
--secondary-blue: #3B82F6;    /* Secondary actions, accents */
--light-blue: #DBEAFE;        /* Backgrounds, badges, highlights */
```

### Neutral Colors
```css
--background: #FFFFFF;        /* Main background */
--surface: #F8FAFC;          /* Card backgrounds, sections */
--surface-secondary: #F1F5F9; /* Alternative backgrounds */
--text-primary: #0F172A;      /* Headings, primary text */
--text-secondary: #64748B;    /* Body text, descriptions */
--text-muted: #94A3B8;        /* Captions, metadata */
--border: #E2E8F0;           /* Borders, dividers */
--border-light: #F1F5F9;     /* Subtle borders */
```

### Semantic Colors
```css
--success: #10B981;          /* Success states, positive actions */
--warning: #F59E0B;          /* Warning states, attention */
--error: #EF4444;            /* Error states, destructive actions */
```

### Usage Guidelines
- **Primary Blue:** Use for main CTAs, active states, and brand elements
- **Secondary Blue:** Use for secondary actions and hover states
- **Light Blue:** Use for backgrounds and subtle highlights
- **Text Colors:** Follow hierarchy - primary for headings, secondary for body text
- **Semantic Colors:** Use consistently for their respective states

## Typography

### Font Family
```css
--font-primary: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

### Font Weights
```css
--font-weight-regular: 400;   /* Body text, descriptions */
--font-weight-medium: 500;    /* Navigation, labels */
--font-weight-semibold: 600;  /* Headings, emphasis */
--font-weight-bold: 700;      /* Hero headings, strong emphasis */
```

### Type Scale
| Element | Size | Weight | Line Height | Usage |
|---------|------|--------|-------------|-------|
| H1 | 48-64px | Bold (700) | 1.2 | Hero headings |
| H2 | 36-48px | Semibold (600) | 1.2 | Section headings |
| H3 | 24-32px | Semibold (600) | 1.3 | Subsection headings |
| H4 | 20px | Semibold (600) | 1.4 | Card titles |
| H5 | 18px | Semibold (600) | 1.4 | Small headings |
| H6 | 16px | Semibold (600) | 1.4 | Labels |
| Body Large | 18px | Regular (400) | 1.6 | Hero descriptions |
| Body | 16px | Regular (400) | 1.6 | Main body text |
| Body Small | 14px | Regular (400) | 1.5 | Captions, metadata |
| Caption | 12px | Medium (500) | 1.4 | Small labels |

## Spacing System

### 8px Grid System
```css
--space-0: 0;
--space-1: 8px;      /* Tight spacing */
--space-2: 16px;     /* Small spacing */
--space-3: 24px;     /* Medium spacing */
--space-4: 32px;     /* Large spacing */
--space-5: 40px;     /* Extra large spacing */
--space-6: 48px;     /* Section spacing */
--space-8: 64px;     /* Large section spacing */
--space-10: 80px;    /* Extra large section spacing */
--space-12: 96px;    /* Hero section spacing */
--space-16: 128px;   /* Maximum section spacing */
```

### Usage Guidelines
- Use multiples of 8px for all spacing
- Maintain consistent vertical rhythm
- Use larger spacing for section separation
- Use smaller spacing for related elements

## Border Radius

```css
--radius-sm: 4px;    /* Small elements, badges */
--radius-md: 6px;    /* Buttons, form inputs */
--radius-lg: 8px;    /* Cards, larger buttons */
--radius-xl: 12px;   /* Large cards, modals */
```

## Shadows

```css
--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);           /* Subtle elevation */
--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);  /* Card elevation */
--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1); /* Modal elevation */
--shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1); /* Maximum elevation */
```

## Component Library

### Buttons

#### Primary Button
```css
.btn-primary {
  background: var(--primary-blue);
  color: white;
  padding: var(--space-3) var(--space-6);
  border-radius: var(--radius-lg);
  font-weight: var(--font-weight-semibold);
  transition: all 0.2s ease;
}

.btn-primary:hover {
  background: #1E3A8A;
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}
```

#### Secondary Button
```css
.btn-secondary {
  background: var(--background);
  color: var(--text-primary);
  border: 1px solid var(--border);
  padding: var(--space-3) var(--space-6);
  border-radius: var(--radius-lg);
  font-weight: var(--font-weight-semibold);
  transition: all 0.2s ease;
}

.btn-secondary:hover {
  background: var(--surface);
  border-color: var(--text-secondary);
}
```

#### Button Sizes
- **Small:** `padding: var(--space-2) var(--space-4); font-size: 14px;`
- **Medium:** `padding: var(--space-3) var(--space-6); font-size: 16px;` (default)
- **Large:** `padding: var(--space-4) var(--space-8); font-size: 18px;`

### Cards

#### Basic Card
```css
.card {
  background: var(--background);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-xl);
  padding: var(--space-6);
  box-shadow: var(--shadow-sm);
  transition: all 0.2s ease;
}

.card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}
```

#### Feature Card
```css
.feature-card {
  background: var(--background);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-xl);
  padding: var(--space-6);
  box-shadow: var(--shadow-sm);
  transition: all 0.2s ease;
  text-align: center;
}

.feature-icon {
  width: 48px;
  height: 48px;
  background: var(--light-blue);
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto var(--space-4);
}
```

### Navigation

#### Header Navigation
```css
.nav {
  height: 72px;
  background: var(--background);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  z-index: 100;
  backdrop-filter: blur(8px);
}

.nav-link {
  color: var(--text-secondary);
  font-weight: var(--font-weight-medium);
  font-size: 15px;
  text-decoration: none;
  transition: color 0.2s ease;
}

.nav-link:hover,
.nav-link.active {
  color: var(--text-primary);
}
```

### Forms

#### Input Fields
```css
.form-input {
  width: 100%;
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: 16px;
  transition: border-color 0.2s ease;
}

.form-input:focus {
  outline: none;
  border-color: var(--primary-blue);
  box-shadow: 0 0 0 3px rgb(30 64 175 / 0.1);
}
```

### Badges

```css
.badge {
  display: inline-block;
  padding: var(--space-1) var(--space-3);
  background: var(--light-blue);
  color: var(--primary-blue);
  font-size: 14px;
  font-weight: var(--font-weight-medium);
  border-radius: var(--radius-lg);
}
```

## Layout Guidelines

### Container System
```css
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 var(--space-4);
}

.container-wide {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 var(--space-4);
}
```

### Grid System
```css
.grid {
  display: grid;
  gap: var(--space-6);
}

.grid-2 { grid-template-columns: repeat(2, 1fr); }
.grid-3 { grid-template-columns: repeat(3, 1fr); }
.grid-4 { grid-template-columns: repeat(4, 1fr); }

.grid-auto {
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
}
```

### Section Spacing
```css
.section {
  padding: var(--space-16) 0;
}

.section-sm {
  padding: var(--space-12) 0;
}

.section-lg {
  padding: var(--space-20) 0;
}
```

## Responsive Design

### Breakpoints
```css
/* Mobile First Approach */
@media (min-width: 640px) { /* sm */ }
@media (min-width: 768px) { /* md */ }
@media (min-width: 1024px) { /* lg */ }
@media (min-width: 1280px) { /* xl */ }
```

### Mobile Adaptations
- Stack grid layouts vertically
- Reduce font sizes appropriately
- Adjust spacing for smaller screens
- Hide/show navigation elements
- Optimize touch targets (minimum 44px)

## Accessibility Guidelines

### Color Contrast
- Ensure minimum 4.5:1 contrast ratio for normal text
- Ensure minimum 3:1 contrast ratio for large text
- Test with color blindness simulators

### Focus States
- Provide visible focus indicators
- Use consistent focus styling across components
- Ensure keyboard navigation works properly

### Semantic HTML
- Use proper heading hierarchy
- Include alt text for images
- Use semantic HTML elements
- Provide ARIA labels where needed

## Implementation Checklist

### Phase 1: Foundation
- [ ] Update CSS custom properties
- [ ] Implement typography system
- [ ] Set up spacing system
- [ ] Create base component styles

### Phase 2: Components
- [ ] Button system
- [ ] Card components
- [ ] Navigation components
- [ ] Form elements

### Phase 3: Layout
- [ ] Container system
- [ ] Grid system
- [ ] Section layouts
- [ ] Responsive design

### Phase 4: Testing
- [ ] Cross-browser testing
- [ ] Accessibility audit
- [ ] Performance testing
- [ ] Design consistency review

## Maintenance Guidelines

### Code Organization
- Keep CSS custom properties in a central location
- Use consistent naming conventions
- Document component variations
- Maintain component library documentation

### Design Updates
- Update design system documentation when making changes
- Ensure consistency across all components
- Test changes across different contexts
- Communicate changes to the development team

This design system provides a comprehensive foundation for CertXA's professional redesign, ensuring consistency, maintainability, and scalability across the platform.