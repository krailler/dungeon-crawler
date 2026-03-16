import { useState, useSyncExternalStore, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { authStore } from "../stores/authStore";
import { PROTOCOL_VERSION } from "@dungeon/shared";

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

  // ── Reconnect screen ──────────────────────────────────────────────────────
  if (auth.canReconnect) {
    return (
      <div className="pointer-events-auto fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#05070d]">
        <h1 className="mb-4 text-4xl font-bold tracking-widest text-slate-200">
          {t("reconnect.title")}
        </h1>
        <p className="mb-8 max-w-sm text-center text-sm text-slate-400">{t("reconnect.message")}</p>
        {auth.characterName && (
          <p className="mb-6 text-xs text-slate-500">
            {t("reconnect.asCharacter", { name: auth.characterName })}
          </p>
        )}
        <button
          onClick={() => authStore.attemptReconnect()}
          className="rounded-lg bg-amber-600/90 px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-amber-500/90"
        >
          {t("reconnect.button")}
        </button>
        <button
          onClick={() => authStore.kick("")}
          className="mt-4 text-xs text-slate-500 transition-colors hover:text-slate-300"
        >
          {t("reconnect.backToLogin")}
        </button>
        {auth.error && <p className="mt-4 text-center text-xs text-red-400">{auth.error}</p>}

        <span className="absolute bottom-3 right-4 text-[10px] text-slate-600">
          Build Version: {PROTOCOL_VERSION}
        </span>
      </div>
    );
  }

  // ── Login screen ──────────────────────────────────────────────────────────
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

      {/* Dev quick-login */}
      {import.meta.env.DEV && (
        <div className="mt-10 w-80 rounded-lg border-2 border-dashed border-yellow-500/30 bg-yellow-950/10 p-4">
          <div className="mb-3 text-center text-[10px] font-bold uppercase tracking-[0.3em] text-yellow-500/70">
            {t("login.devMode")}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => authStore.login("admin@admin.com", "admin")}
              disabled={auth.loading}
              className="flex-1 rounded-lg border border-amber-500/30 bg-amber-900/20 px-4 py-2 text-xs text-amber-400 transition-colors hover:bg-amber-900/40 disabled:opacity-40"
            >
              {t("login.devAdmin")}
            </button>
            <button
              onClick={() => authStore.login("test@test.com", "password")}
              disabled={auth.loading}
              className="flex-1 rounded-lg border border-sky-500/30 bg-sky-900/20 px-4 py-2 text-xs text-sky-400 transition-colors hover:bg-sky-900/40 disabled:opacity-40"
            >
              {t("login.devPlayer")}
            </button>
          </div>
        </div>
      )}

      {/* Version */}
      <span className="absolute bottom-3 right-4 text-[10px] text-slate-600">
        Build Version: {PROTOCOL_VERSION}
      </span>
    </div>
  );
};
