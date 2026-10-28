export const LANGUAGES: Record<string, string> = {
  es: "Español",
  en: "Inglés",
  pt: "Portugués",
  it: "Italiano",
  fr: "Francés",
  de: "Alemán",
  ja: "Japonés",
  ko: "Coreano",
};

export const languageName = (code?: string) => (code ? (LANGUAGES[code] ?? code.toUpperCase()) : "—");
