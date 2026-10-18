# Homologação de campo

Esta matriz define verificações de aparelhos e operação. Os resultados executados nesta entrega ficam em `validation.md`; linhas deste documento não significam testes já aprovados.

| Cenário | Resultado exigido |
|---|---|
| Cadastro e vínculo | Código expira, não repete; permissões/consentimento no aparelho; nenhuma coleta antes de alerta |
| Toque breve, arrasto e botão no bolso | Nenhuma ocorrência criada; 3s contínuos criam uma só |
| Teste ainda aberto → necessidade real | Mesma ocorrência promovida, rótulo real e novo aviso na central; sem perda de emergência |
| Alerta sem GPS/microfone | Persistência/envio do alerta primeiro; indisponibilidade de sensores explícita |
| Tela bloqueada e outra aplicação | Acionamento da notificação conforme Android; sensores continuam apenas em ocorrência e com permissões |
| Volume com app aberto | Dois botões sustentados3s criam uma só ocorrência; repetição automática não duplica |
| Volume com outro app/tela bloqueada | Não anunciar atalho global; validar o método de notificação treinado |
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
