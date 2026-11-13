/**
 * Tema único dos formulários do app.
 *
 * A referência visual é a tela de checklist de fiscalização (app/checklist-fiscalizacao.tsx):
 * fundo cinza claro, superfícies brancas, vermelho Teccel como cor de ação, inputs de raio 8,
 * cartões de raio 14. Os valores abaixo foram copiados de lá; as demais telas devem consumir
 * este arquivo em vez de repetir hexadecimais.
 */

export const colors = {
  // Ação e identidade
  primary: '#DC2626',
  primaryDisabled: '#FCA5A5',
  primarySoft: '#FEE2E2',
  primaryTint: '#FEF2F2',
  danger: '#EF4444',

  // Fundos e superfícies
  background: '#F3F4F6',
  surface: '#FFFFFF',
  surfaceMuted: '#F9FAFB',

  // Bordas
  border: '#E5E7EB',
  borderInput: '#D1D5DB',
  divider: '#F3F4F6',

  // Texto
  text: '#111827',
  textStrong: '#374151',
  textBody: '#4B5563',
  textMuted: '#6B7280',
  textSubtle: '#9CA3AF',
  textOnPrimary: '#FFFFFF',
} as const;

export const radius = {
  input: 8,
  button: 10,
  card: 14,
  pill: 999,
} as const;

export const spacing = {
  screen: 16,
  cardPadding: 14,
  gap: 8,
} as const;

export const typography = {
  label: { fontSize: 12, fontWeight: '600' as const, color: colors.textBody },
  input: { fontSize: 15, color: colors.text },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    color: colors.textStrong,
  },
  hint: { fontSize: 12, color: colors.textMuted },
  button: { fontSize: 13, fontWeight: '700' as const, color: colors.textOnPrimary },
} as const;

/** Sombra leve usada nos cartões de seção. */
export const cardShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;

export const theme = { colors, radius, spacing, typography, cardShadow } as const;

export default theme;
