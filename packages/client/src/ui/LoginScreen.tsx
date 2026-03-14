import { useState, useSyncExternalStore, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { authStore } from "./authStore";

export const LoginScreen = (): JSX.Element | null => {
  const { t } = useTranslation();
  const auth = useSyncExternalStore(authStore.subscribe, authStore.getSnapshot);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (auth.isAuthenticated) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password || auth.loading) return;
    authStore.login(email, password);
  };

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#05070d]">
      {/* Title */}
      <h1 className="mb-10 text-4xl font-bold tracking-widest text-slate-200">
        {t("login.title")}
      </h1>

      {/* Login form */}
      <form onSubmit={handleSubmit} className="flex w-80 flex-col gap-4">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("login.email")}
          autoComplete="email"
          className="rounded-lg border border-slate-600/40 bg-slate-900/80 px-4 py-3 text-sm text-slate-200 placeholder-slate-500 outline-none transition-colors focus:border-amber-500/60"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("login.password")}
          autoComplete="current-password"
          className="rounded-lg border border-slate-600/40 bg-slate-900/80 px-4 py-3 text-sm text-slate-200 placeholder-slate-500 outline-none transition-colors focus:border-amber-500/60"
        />

        <button
          type="submit"
          disabled={auth.loading || !email || !password}
          className="mt-2 rounded-lg bg-amber-600/90 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-amber-500/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {auth.loading ? t("login.loading") : t("login.submit")}
        </button>

        {auth.error && <p className="text-center text-xs text-red-400">{auth.error}</p>}
      </form>
    </div>
  );
};
