"use client";

import { createContext, useContext, useMemo, useState } from "react";

export type Language = "bn" | "en";
export type Copy = { bn: string; en: string };

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");

  const value = useMemo(
    () => ({
      language,
      setLanguage: (nextLanguage: Language) => {
        setLanguageState(nextLanguage);
        document.documentElement.lang = nextLanguage;
      },
    }),
    [language],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within LanguageProvider");
  return context;
}

export function BilingualText({ copy, className }: { copy: Copy; className?: string }) {
  const { language } = useLanguage();

  return (
    <span className={className} lang={language}>
      {copy[language]}
    </span>
  );
}

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="language-switcher" role="group" aria-label="Change language / ভাষা পরিবর্তন">
      <button
        className="language-option"
        type="button"
        aria-pressed={language === "en"}
        onClick={() => setLanguage("en")}
      >
        <span lang="en">en</span>
      </button>
      <button
        className="language-option"
        type="button"
        aria-pressed={language === "bn"}
        onClick={() => setLanguage("bn")}
      >
        <span lang="bn">বাংলা</span>
      </button>
    </div>
  );
}
