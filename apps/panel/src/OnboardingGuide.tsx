import { useLayoutEffect, useRef, type RefObject } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  BookOpen,
  Check,
  CheckCheck,
  Clock3,
  Headphones,
  Info,
  Link2,
  MapPin,
  ShieldCheck,
  UserCheck,
  Volume2,
  X,
} from "lucide-react";
import MotionSignal from "./MotionSignal";
import { guideSteps, type GuideDiagram } from "./guideContent";
import type { GuideState } from "./onboarding";

function GuideArt({ kind }: { kind: GuideDiagram }) {
  return (
    <figure className={`guide-art guide-art--${kind}`}>
      <figcaption>EXEMPLO DO GUIA · SEM DADOS OPERACIONAIS</figcaption>
      <div aria-hidden="true" className="guide-diagram">
        {kind === "signals" && (
          <div className="guide-signal-grid">
            <span>
              <Bell size={24} />
              <small>Perceber</small>
            </span>
            <span className="guide-signal-main">
              <MotionSignal kind="alert" active size="medium" />
              <small>Conferir o alerta</small>
            </span>
            <span>
              <MotionSignal kind="confirmed" active size="medium" />
              <small>Agir com intenção</small>
            </span>
          </div>
        )}
        {kind === "receipt" && (
          <div className="guide-flow">
            <div>
              <span className="guide-flow-icon">
                <Check size={20} />
              </span>
              <strong>Recebido</strong>
              <small>Confirmação técnica</small>
            </div>
            <i />
            <div>
              <span className="guide-flow-icon gold">
                <CheckCheck size={20} />
              </span>
              <strong>Reconhecido</strong>
              <small>Leitura humana</small>
            </div>
            <i />
            <div>
              <span className="guide-flow-icon blue">
                <UserCheck size={20} />
              </span>
              <strong>Assumido</strong>
              <small>Responsável definido</small>
            </div>
          </div>
        )}
        {kind === "responsibility" && (
          <div className="guide-responsibility">
            <div className="guide-example-card">
              <span className="eyebrow">OCORRÊNCIA ILUSTRATIVA</span>
              <div>
                <ShieldCheck size={25} />
                <strong>Responsável definido</strong>
              </div>
              <p>Operador autorizado · atribuição confirmada</p>
            </div>
            <div className="guide-example-record">
              <CheckCheck size={16} />
              <span>Reconhecimento</span>
              <i />
              <UserCheck size={16} />
              <span>Atribuição</span>
            </div>
          </div>
        )}
        {kind === "position" && (
          <div className="guide-position">
            <svg viewBox="0 0 420 150" fill="none">
              <path
                className="guide-road"
                d="M0 35h420M0 115h420M80 0v150M225 0v150M355 0v150"
              />
              <path
                className="guide-trail"
                d="m100 110 64-19 47 5 52-28"
                pathLength="1"
              />
              <circle className="guide-accuracy" cx="263" cy="68" r="43" />
              <circle className="guide-point" cx="263" cy="68" r="7" />
              <circle className="guide-old-point" cx="100" cy="110" r="4" />
            </svg>
            <span className="guide-position-tag">
              <MapPin size={13} /> Margem de precisão
            </span>
            <span className="guide-time-tag">
              <Clock3 size={13} /> Confira o horário
            </span>
          </div>
        )}
        {kind === "audio" && (
          <div className="guide-audio">
            <Headphones size={25} />
            <div className="guide-audio-blocks">
              {["01", "02", "—", "04", "05"].map((number, index) => (
                <span key={index} className={number === "—" ? "missing" : ""}>
                  <i style={{ height: `${18 + (index % 3) * 9}px` }} />
                  <small>{number}</small>
                </span>
              ))}
            </div>
            <p>
              Blocos recebidos <i /> Possível lacuna
            </p>
          </div>
        )}
        {kind === "pairing" && (
          <div className="guide-pairing">
            <div>
              <Link2 size={21} />
              <span className="guide-example-code">•••• ••••</span>
              <span className="guide-time-limit">
                <Clock3 size={13} /> 10 min
              </span>
            </div>
            <p>
              Gerar código <ArrowRight size={14} /> Consentir no celular{" "}
              <ArrowRight size={14} /> Confirmar vínculo
            </p>
            <span className="guide-simulation-example">
              SIMULADO <small>Exercício identificado</small>
            </span>
          </div>
        )}
      </div>
    </figure>
  );
}

export default function OnboardingGuide({
  state,
  role,
  sound,
  notifications,
  onStep,
  onComplete,
  onAlerts,
  onSound,
  onNotifications,
  helpRef,
}: {
  state: GuideState;
  role: string;
  sound: boolean;
  notifications: boolean;
  onStep: (step: number) => void;
  onComplete: () => void;
  onAlerts: () => void;
  onSound: () => void;
  onNotifications: () => void;
  helpRef: RefObject<HTMLButtonElement | null>;
}) {
  const steps = guideSteps(role);
  const index = Math.min(state.step, steps.length - 1);
  const step = steps[index];
  const heading = useRef<HTMLHeadingElement>(null);
  const panel = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [index]);
  useLayoutEffect(
    () => () => {
      // A new alert can remove this nonmodal guide. Return its keyboard focus to
      // the operational heading only when it was still inside the guide.
      if (panel.current?.contains(document.activeElement))
        document
          .getElementById("central-title")
          ?.focus({ preventScroll: true });
    },
    [],
  );
  function complete() {
    helpRef.current?.focus({ preventScroll: true });
    onComplete();
  }
  return (
    <aside
      ref={panel}
      id="central-guide"
      className="central-guide"
      role="dialog"
      aria-modal="false"
      aria-labelledby="guide-title"
      aria-describedby="guide-description"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          complete();
        }
      }}
    >
      <header className="guide-top">
        <span>
          <BookOpen size={17} /> Guia da central <small>VERSÃO 1</small>
        </span>
        <button
          className="icon-button"
          title="Fechar e salvar preferência"
          aria-label="Fechar e salvar preferência do guia"
          onClick={complete}
        >
          <X size={19} />
        </button>
      </header>
      <div className="guide-priority">
        <Info size={15} />
        <p>A operação continua acessível. Um novo alerta fecha este guia.</p>
        <button onClick={onAlerts}>
          Ir aos alertas <ArrowRight size={14} />
        </button>
      </div>
      <nav className="guide-stepper" aria-label="Etapas do guia">
        {steps.map((item, number) => (
          <button
            key={item.id}
            aria-label={`Etapa ${number + 1}: ${item.kicker.slice(5)}`}
            aria-current={number === index ? "step" : undefined}
            onClick={() => onStep(number)}
          >
            <span>
              {number < index ? (
                <Check size={13} />
              ) : (
                String(number + 1).padStart(2, "0")
              )}
            </span>
            <i />
          </button>
        ))}
      </nav>
      <div className="guide-scroll" key={step.id}>
        <div className="guide-copy">
          <span className="eyebrow">{step.kicker}</span>
          <h2 ref={heading} tabIndex={-1} id="guide-title">
            {step.title}
          </h2>
          <p id="guide-description">{step.description}</p>
        </div>
        <GuideArt kind={step.diagram} />
        <ul className="guide-details">
          {step.details.map((detail) => (
            <li key={detail}>
              <span />
              <p>{detail}</p>
            </li>
          ))}
        </ul>
        {index === 0 && (
          <div className="guide-setup" aria-label="Preparar o navegador">
            <button className="button secondary" onClick={onSound}>
              <Volume2 size={16} />
              {sound ? "Testar som novamente" : "Ativar e testar som"}
            </button>
            <button
              className="button secondary"
              onClick={onNotifications}
              disabled={notifications}
            >
              <Bell size={16} />
              {notifications ? "Notificações ativas" : "Ativar notificações"}
            </button>
            <small>
              Som de teste somente ao clicar. Sem áudio de ocorrências.
            </small>
          </div>
        )}
        <p className="guide-note">
          <ShieldCheck size={17} />
          <span>{step.note}</span>
        </p>
      </div>
      <footer className="guide-bottom">
        <button className="text-button" onClick={complete}>
          Pular e salvar
        </button>
        <div>
          <button
            className="button secondary"
            disabled={index === 0}
            onClick={() => onStep(index - 1)}
          >
            <ArrowLeft size={15} />
            <span>Voltar</span>
          </button>
          {index === steps.length - 1 ? (
            <button className="button primary" onClick={complete}>
              <Check size={16} />
              Concluir guia
            </button>
          ) : (
            <button
              className="button primary"
              onClick={() => onStep(index + 1)}
            >
              Continuar
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      </footer>
    </aside>
  );
}
