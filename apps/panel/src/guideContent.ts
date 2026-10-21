export type GuideDiagram =
  "signals" | "receipt" | "responsibility" | "position" | "audio" | "pairing";
export interface GuideStep {
  id: string;
  kicker: string;
  title: string;
  description: string;
  details: string[];
  note: string;
  diagram: GuideDiagram;
}
export function guideSteps(role: string): GuideStep[] {
  const manages = role === "admin" || role === "dispatcher";
  return [
    {
      id: "prepare",
      kicker: "01 / PREPARAR O PLANTÃO",
      title: "Uma central atenta começa aqui.",
      description:
        "Conheça os sinais da central e prepare seu navegador. Você pode sair do guia a qualquer momento.",
      details: [
        "Som e notificações precisam de uma escolha sua. Ative, teste o volume e confira as permissões do navegador a cada plantão.",
        "Este guia não abre o microfone, não reproduz áudio de ocorrências e não executa ações de atendimento.",
      ],
      note: "O guia é pessoal. Concluir ou pular salva sua preferência nesta conta; ele continua disponível em “Guia da central”.",
      diagram: "signals",
    },
    {
      id: "receipt",
      kicker: "02 / RECEBER E RECONHECER",
      title: "Cada confirmação tem um significado.",
      description:
        "Um alerta na fila informa que o servidor recebeu o evento. Isso ainda não comprova leitura ou resposta humana.",
      details: [
        "“Reconhecer alerta” registra que uma pessoa viu o pedido. Essa ação não atribui um responsável.",
        "A central conectada não garante atendimento. Se a conexão cair, o painel recupera os dados; confira o horário da última atualização.",
      ],
      note: manages
        ? "Na operação, reconheça o alerta e confira a situação antes de assumir a responsabilidade."
        : "Seu perfil permite consulta. Reconhecimento e atendimento são ações dos operadores autorizados.",
      diagram: "receipt",
    },
    {
      id: "responsibility",
      kicker: "03 / DEFINIR RESPONSABILIDADE",
      title: manages
        ? "Assumir é tornar-se responsável."
        : "Acompanhe quem assumiu o atendimento.",
      description: manages
        ? "“Assumir ocorrência” atribui o atendimento a você, com confirmação do servidor."
        : "Seu perfil de consulta acompanha a fila, a localização e o responsável; não altera ocorrências.",
      details: manages
        ? [
            "Se outra pessoa assumir primeiro, a central atualiza o responsável. Confira o estado exibido antes de continuar.",
            "O responsável ou a administração pode encerrar com uma justificativa. O desfecho fica registrado na auditoria.",
          ]
        : [
            "Somente perfis de operação e administração reconhecem e assumem ocorrências.",
            "O encerramento exige o responsável ou a administração e uma justificativa. Você pode consultar os registros de auditoria.",
          ],
      note: "Atribuição e reconhecimento não comprovam deslocamento ou chegada de uma equipe. Siga o procedimento da instituição.",
      diagram: "responsibility",
    },
    {
      id: "position",
      kicker: "04 / INTERPRETAR O SINAL",
      title: "Localização tem horário e precisão.",
      description:
        "O ponto indica a última posição recebida. O círculo mostra a margem de precisão, e a trilha organiza as posições anteriores.",
      details: [
        "Confira quando a posição foi capturada. “Posição antiga” pode não representar onde a assistida está agora.",
        "Zoom e acompanhamento ajudam a orientar a leitura. Falha no mapa base não apaga as coordenadas recebidas.",
      ],
      note: "Use horário, precisão e contexto em conjunto. Atualização do mapa não garante localização atual em tempo real.",
      diagram: "position",
    },
    {
      id: "audio",
      kicker: "05 / OUVIR COM CUIDADO",
      title: "A escuta começa pela sua escolha.",
      description:
        "Os blocos de áudio são privados e só ficam disponíveis quando há consentimento no aparelho e envio pelo dispositivo.",
      details: [
        "Escolha “Ouvir blocos recebidos” para iniciar. Não há reprodução automática ao abrir a central ou este guia.",
        "Blocos podem chegar com atraso ou lacunas. Confira os avisos: nenhum áudio recebido não significa que o local esteja em silêncio.",
      ],
      note: "O acesso ao áudio é autenticado e auditado. Blocos recebidos não são uma chamada ao vivo com latência garantida.",
      diagram: "audio",
    },
    {
      id: "pairing",
      kicker: "06 / VINCULAR E FINALIZAR",
      title: "Um vínculo consentido. Um desfecho registrado.",
      description: manages
        ? "Cadastre a assistida e gere o código de vínculo quando estiver com a equipe responsável."
        : "O cadastro e a geração de vínculo são feitos pelos perfis de operação e administração.",
      details: [
        "O código tem oito dígitos, vale dez minutos e só pode ser usado uma vez. Gerar o código ainda não confirma o vínculo: a assistida registra seus consentimentos no celular.",
        "Confira sempre a marcação SIMULADO. Demonstração e exercícios não comprovam atendimento real; um alerta real exige a atenção da operação.",
        "Ao encerrar, registre o motivo e o encaminhamento. A coleta termina quando o aparelho recebe a atualização da central.",
      ],
      note: "O guia é uma orientação de uso. A escala, a resposta e os procedimentos de atendimento são definidos pela instituição.",
      diagram: "pairing",
    },
  ];
}
