# Apricot Crab Web Frontend

## Styling conventions

- **Use `src/theme.css` for all colors and fonts.** Reference the CSS variables
  (e.g. `var(--main-accent)`, `var(--main-font-brand)`) instead of hardcoding
  colors or font stacks. If a needed value is missing, add it to `theme.css`.
- **Prefer `rem` over `px`** for sizing, spacing, and typography.
