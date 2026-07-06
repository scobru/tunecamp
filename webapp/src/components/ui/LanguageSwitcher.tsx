import { useTranslation } from "react-i18next";
import clsx from "clsx";

const LANGS = ["en", "it"] as const;

export const LanguageSwitcher = () => {
  const { i18n, t } = useTranslation();

  return (
    <div
      className="flex items-center gap-1 p-1 bg-base-300/30 rounded-full border border-base-content/5 w-fit"
      title={t("language")}
    >
      {LANGS.map((lng) => (
        <button
          key={lng}
          onClick={() => i18n.changeLanguage(lng)}
          className={clsx(
            "px-2 py-0.5 rounded-full text-[11px] font-bold uppercase transition-all",
            i18n.resolvedLanguage === lng
              ? "bg-primary text-primary-content"
              : "opacity-60 hover:opacity-100"
          )}
        >
          {lng}
        </button>
      ))}
    </div>
  );
};
