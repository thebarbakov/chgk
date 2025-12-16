import React from "react";
import { ButtonLink } from "./components/ui";

export default function Home() {
  const roles = [
    { label: "Телевизор", href: "/tv" },
    { label: "Ведущий", href: "/host" },
    { label: "Игрок", href: "/player" },
    { label: "Администратор", href: "/admin" },
  ];

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_60%_10%,rgba(255,255,255,0.08),transparent_25%),radial-gradient(circle_at_5%_40%,rgba(210,168,93,0.1),transparent_28%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.05),rgba(255,255,255,0))]" />
      </div>

      <main className="relative mx-auto max-w-5xl px-6 pb-16 pt-16 lg:px-10">
        <div className="flex flex-col items-center gap-4 text-center">
          <img
            src="/media/images/logo.png"
            alt="logo"
            className="h-28 w-auto md:h-32 drop-shadow-[0_10px_30px_rgba(0,0,0,0.45)]"
          />
          <h1 className="text-4xl font-semibold text-amber-50 lg:text-5xl">Что? Где? Когда?</h1>
          <p className="text-sm uppercase tracking-[0.35em] text-amber-200/80">Выберите роль</p>
        </div>

        <section className="mt-10 grid gap-4 sm:grid-cols-2">
          {roles.map((role) => (
            <div
              key={role.href}
              className="rounded-2xl border border-amber-500/25 bg-gradient-to-br from-white/10 via-white/5 to-black/30 p-5 shadow-[0_14px_50px_rgba(0,0,0,0.45)]"
            >
              <p className="text-lg font-semibold text-amber-50">{role.label}</p>
              <p className="mt-1 text-sm text-black-100/80">Перейти в интерфейс роли</p>
              <div className="mt-4">
                <ButtonLink href={role.href} label={`Перейти: ${role.label}`} />
              </div>
            </div>
          ))}
        </section>

        <section className="mt-10 rounded-2xl border border-amber-500/25 bg-white/5 p-6 shadow-[0_10px_50px_rgba(0,0,0,0.35)]">
          <p className="text-xs uppercase tracking-[0.3em] text-amber-200/80">Краткие правила</p>
          <div className="mt-4 space-y-3 text-sm text-amber-100/80">
            <p>— Обычный вопрос: 60 секунд обсуждения, 1 балл за правильный ответ.</p>
            <p>— Блиц: 3 вопроса по 20 секунд, очко только при трех верных ответах.</p>
            <p>— Суперблиц: один игрок, 3 вопроса по 20 секунд, нужен 3/3.</p>87
          </div>
        </section>
      </main>
    </div>
  );
}
