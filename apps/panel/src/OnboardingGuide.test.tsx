import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import OnboardingGuide from "./OnboardingGuide";
import { OnboardingSession } from "./onboarding";
import { guideSteps } from "./guideContent";

function markup(step = 0, role = "dispatcher", notifications = false) {
  const session = new OnboardingSession();
  return renderToStaticMarkup(
    <OnboardingGuide
      state={{
        ...session.getSnapshot(),
        open: true,
        step,
        operatorId: "operator-a",
      }}
      role={role}
      sound={false}
      notifications={notifications}
      helpRef={createRef<HTMLButtonElement>()}
      onStep={vi.fn()}
      onComplete={vi.fn()}
      onAlerts={vi.fn()}
      onSound={vi.fn()}
      onNotifications={vi.fn()}
    />,
  );
}
describe("central guide presentation", () => {
  it("keeps an immediate operational exit, explicit skip and keyboard focus target on every step", () => {
    for (let step = 0; step < guideSteps("dispatcher").length; step++) {
      const html = markup(step);
      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="false"');
      expect(html).toContain("Ir aos alertas");
      expect(html).toContain("Pular e salvar");
      expect(html).toMatch(
        /<h2(?=[^>]*id="guide-title")(?=[^>]*tabindex="-1")[^>]*>/,
      );
      expect(html).toContain("EXEMPLO DO GUIA · SEM DADOS OPERACIONAIS");
      expect(html).not.toContain("<audio");
    }
  });
  it("offers browser permissions only in the setup step and indicates already-enabled notifications", () => {
    expect(markup()).toContain("Ativar e testar som");
    expect(markup()).toContain("Ativar notificações");
    expect(markup(0, "observer", true)).toContain('disabled=""><svg');
    expect(markup(0, "observer", true)).toContain("Notificações ativas");
    expect(markup(1)).not.toContain("Preparar o navegador");
  });
  it("gives observers role-specific guidance without offering assignment or pairing operations", () => {
    const html = markup(2, "observer") + markup(5, "observer");
    expect(html).toContain("não altera ocorrências");
    expect(html).toContain(
      "O cadastro e a geração de vínculo são feitos pelos perfis de operação e administração.",
    );
    expect(html).not.toContain(">Assumir ocorrência<");
    expect(html).not.toContain(">Gerar vínculo<");
  });
});
