import { createContext, useContext, useMemo, useRef } from 'react';
import type { AppLocale } from './i18n';
import { translateUi } from './uiTranslation';

/** Shared by the desk, portal menus, library and dialogs. No DOM scanning or extra animation loop. */
export const UiLocaleContext = createContext<AppLocale>('zh');
export function useUiText(override?: AppLocale) {
  const inherited = useContext(UiLocaleContext);
  const locale = override ?? inherited;
  // Event handlers may retain an older translator; they still read the current locale.
  const current = useRef(locale);
  current.current = locale;
  return useMemo(() => (message: string, ...values: unknown[]) => translateUi(current.current, message, ...values), [locale]);
}
