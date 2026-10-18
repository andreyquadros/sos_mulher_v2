# Homologação de campo

Esta matriz define verificações de aparelhos e operação. Os resultados executados nesta entrega ficam em `validation.md`; linhas deste documento não significam testes já aprovados.

| Cenário | Resultado exigido |
|---|---|
| Cadastro e vínculo | Código expira, não repete; permissões/consentimento no aparelho; nenhuma coleta antes de alerta |
| Toque breve, arrasto e botão no bolso | Nenhuma ocorrência criada; 3s contínuos criam uma só |
| Teste ainda aberto → necessidade real | Mesma ocorrência promovida, rótulo real e novo aviso na central; sem perda de emergência |
| Alerta sem GPS/microfone | Persistência/envio do alerta primeiro; indisponibilidade de sensores explícita |
| Tela bloqueada e outra aplicação | Acionamento da notificação conforme Android; sensores continuam apenas em ocorrência e com permissões |
| Adesão ao atalho físico | Consentimento explícito, habilitação nas configurações Android e confirmação real separada; sem habilitação automática |
| Escopo de acessibilidade | Somente volume; sem leitura de conteúdo de tela, gestos ou screenshot; `isAccessibilityTool=false`; volume normal preservado |
| Treino físico | Janela de 90s; sequência com aparelho desbloqueado não aprova; prova exige bloqueio seguro durante toda a sequência; treino não cria alerta nem inicia sensores |
| Sequência de volume | BAIXAR/soltar, SUBIR/soltar, BAIXAR/soltar, SUBIR por 2–4s e soltar; clique≤1s, intervalo≤1,5s, janela≤10s; só release final dispara e cooldown de 30s |
| Volume normal e eventos inválidos | Toques usuais, autorepeat, duas teclas juntas, ordem errada, clique longo, hold>4s, timeout e replay não disparam; novo começo exige soltar todas as teclas |
| Outro app e keyguard | Após treino/habilitação, testar sequência fora do Lume com tela acesa e bloqueio mantido; resultado depende do aparelho e deve ser registrado por modelo |
| Tela apagada | Não presumir entrega de teclas; treinar acender a tela com um toque curto em liga/desliga, sem desbloquear, antes da sequência |
| Chamada e outro filtro de teclas | Identificar conflito/indisponibilidade; não anunciar pronto quando o estado conhecido impede o atalho; praticar alternativa da notificação |
| Pausa e validade do treino | `disarm` desabilita o atalho; reboot, alteração do sistema e novo vínculo invalidam a prova e exigem novo treino/ativação |
| Sessão de sensores morta | `physicalReady=false`; atalho ainda habilitado pode preservar pedido sem sensores se serviço/prova continuam válidos; nunca inicia FGS em segundo plano; reativação exige Activity visível |
| 5min offline → online | Alerta permanece local, reaparece uma vez, fila drena; sem falso recebido/atendido |
| Pacote inválido | Falha permanente em quarentena visível, sem bloquear amostras válidas nem migrar dados para outro incidente |
| Relógio incorreto | Alerta/falha têm estado verdadeiro, usuário orientado, dados não silenciosamente descartados |
| Wi-Fi → dados móveis | Reconexão sem duplicatas, mapa evidencia idade da última posição |
| GPS aproximado e sinal antigo | Círculo de precisão, horário de captura e aviso de sinal antigo |
| Reprodução áudio | Blocos privados, acesso auditado, consentimento obrigatório, lacunas/atrasos visíveis |
| Interromper compartilhamento | Sensores param imediatamente; alerta permanece aberto e fila anterior preservada |
| Encerrar no painel | Aparelho confirma encerramento, sensores param, nova ocorrência não recebe dados da anterior |
| Dois operadores assumem juntos | Um obtém atribuição, outro recebe conflito e atualiza snapshot |
| Logout e sessão expirada | SSE e API deixam de fornecer informação; áudio não pode ser aberto sem sessão |
| Outra agência/dispositivo | Nenhum acesso a assistida, posição, áudio ou ocorrência de identidade alheia |
| Revogar/substituir dispositivo | Token anterior para, sensores cessam, fila não é reutilizada no novo vínculo |
| Encerrar processo/reiniciar aparelho | Sem indicação falsa de serviço ativo; reativação visível durante ocorrência e fila preservada |
| Permissões revogadas/serviço parado Android | Captura para, falha indicada e alerta permanece possível com degradação explícita |
| Central desconectada | Banner de reconexão e snapshot ao voltar; sem alegar atualização em tempo real |
| Atualização do APK | Vínculo/fila mantidos sob mesma assinatura; certificado diferente não atualiza silenciosamente |

Aparelhos: testar Android12,13,14,15 e16 em Samsung, Motorola e pelo menos um fabricante com economia de bateria agressiva, com teste de 30–60min em bloqueio/Doze. Medir consumo de bateria e atraso máximo observado; não extrapolar um emulador para todos os aparelhos. Fazer ensaio com dois operadores e procedimento de escalonamento de um alerta sem reconhecimento. Registrar evidências com dados fictícios.

As políticas/máquina física têm 25 testes JVM aprovados. A instrumentação em emulador API34 com PIN de teste passou, incluindo treino, alerta sob keyguard, GPS/AAC e cooldown; nenhuma linha de homologação em aparelhos físicos deve ser marcada como aprovada por esse fato. A fixture vem somente da API demo, fica fora do Git e usa permissão `600`. Execute `npm run test:android:physical` conforme [physical-trigger.md](physical-trigger.md#ensaio-instrumental-isolado), em AVD descartável Google APIs. O ADB root pertence apenas ao driver de teste; o aplicativo não recebe privilégios de root. Resultados executados pertencem a [validation.md](validation.md), separados da homologação física por fabricante.
