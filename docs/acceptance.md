# Homologação de campo

Esta matriz define verificações de aparelhos e operação. Os resultados executados nesta entrega ficam em `validation.md`; linhas deste documento não significam testes já aprovados.

| Cenário | Resultado exigido |
|---|---|
| Cadastro e vínculo | Código expira, não repete; permissões/consentimento no aparelho; nenhuma localização ou transmissão antes de alerta; microfone local prévio só no modo de voz expressamente iniciado |
| Toque breve, arrasto e botão no bolso | No app e no botão flutuante, somente 5s contínuos criam alerta; soltura, arraste, segundo dedo e cancelamento interrompem a contagem |
| Habilitação do botão flutuante | Vínculo, sessão ativa, permissão Android, treino local sem envio e habilitação real explícita; sem acessibilidade ou microfone prévio obrigatórios |
| Sobreposição e bloqueio | Botão delimitado sobre outros apps, tela acesa/desbloqueada; oculto sob bloqueio ou tela apagada, sem contornar credencial; revogar permissão/pausar remove botão |
| Remover somente o botão | Remoção disponível inclusive durante ocorrência, sem interromper localização ou áudio consentidos; parar compartilhamento continua sendo outra ação |
| Teste ainda aberto → necessidade real | Mesma ocorrência promovida, rótulo real e novo aviso na central; sem perda de emergência |
| Alerta sem GPS/microfone | Persistência/envio do alerta primeiro; indisponibilidade de sensores explícita |
| Tela bloqueada e outra aplicação | Acionamento da notificação conforme Android; compartilhamento de sensores apenas em ocorrência e com permissões; voz local depende de sessão específica já iniciada |
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
| Adesão à voz | Consentimento específico de microfone local; treino e habilitação real separados; nenhum reconhecimento sem ação explícita; indicadores Android disponíveis |
| Treino de voz | Duas enunciações finais da frase escolhida sob bloqueio seguro; aparelho desbloqueado não aprova; sem ocorrência/transmissão; aprovação não habilita modo real |
| Frase completa duas vezes | Vocabulário completo, correspondência exata, palavras com confiança≥0,85 e tempos válidos; uma frase, fala parcial, palavras extras, ordem errada ou resultado antigo/repetido não disparam |
| Cadência da voz | Enunciação de 0,8–6s, palavras de 40ms–1,8s, intervalo interno≤1s; pausa entre enunciações≥400ms e segunda termina até12s após a primeira; callback≤3s; cooldown30s |
| Conversas, silêncio e ruído | Ensaiar frases próximas, conversa cotidiana, áudio ambiente prolongado e ruído sem código; registrar falsos positivos/negativos e tempo exposto, sem declarar taxa zero a partir de poucos ensaios |
| TV, outra pessoa e gravação | Reconhecer limitação: não há biometria nem proteção contra reprodução da frase; código pronunciado duas vezes por outra fonte pode acionar; equipe avalia o ambiente e treina alternativa |
| Acústica da assistida | Ensaiar voz habitual/baixa, sotaque, distância, bolso, capinha e ruído com dados fictícios; registrar detectabilidade da frase sem diminuir os filtros para forçar aprovação |
| Voz com tela apagada | Sessão iniciada visivelmente e modo real confirmado antes de bloquear; observar entrada PCM/reconhecimento em background e escuro, sem depender de Activity aberta ou exibir pronto quando parado |
| Microfone indisponível | Revogação de permissão, controle global de privacidade, falha do AudioRecord ou silenciamento conhecido retiram prontidão, descartam tentativas e exigem habilitação explícita após correção |
| Chamada, câmera, gravador e Bluetooth | Verificar silêncio/prioridade, mudança de rota e recuperação; não presumir que callback de áudio ativo comprova captação audível; não capturar chamadas |
| Interrupção e troca de vínculo na voz | Parar voz, stopSharing, disarm, revogação, re-pair e morte de serviço liberam microfone/recursos, invalidam callbacks pendentes e não reativam modo real automaticamente |
| Voz para ocorrência | Um pedido confirmado para a escuta local antes de iniciar gravação AAC; ocorrência identifica acionamento por voz; nenhum áudio de treino ou prévio é enviado |
| Doze, bateria e consumo da voz | Ensaiar30–60min com tela apagada e aparelho sem carregador em fabricantes distintos; registrar consumo, temperatura, atraso/perda e política de bateria; nenhum wake lock equivale a garantia universal |
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
