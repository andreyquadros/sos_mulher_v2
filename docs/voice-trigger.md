# Acionamento por frase opcional

O Lume oferece reconhecimento de uma frase em português no próprio aparelho para pedir apoio com o celular bloqueado e o app em segundo plano. A assistida autoriza a escuta, escolhe uma das frases disponíveis, treina com bloqueio seguro e confirma separadamente o uso real. O recurso depende de uma sessão iniciada com o aplicativo visível, de permissão de microfone e de o Android continuar fornecendo áudio.

Esse modo mantém o microfone aberto **antes de qualquer ocorrência**, somente para reconhecimento local. A entrada PCM e o texto reconhecido ficam em memória; não são gravados como histórico, enviados à central ou usados para identificar a voz da assistida. Depois de um pedido real, a escuta da frase para e o compartilhamento da ocorrência segue os consentimentos existentes. A notificação e os indicadores de privacidade do Android permanecem visíveis.

## Preparação e uso

1. Com a equipe, vincule o aparelho à central, escolha os consentimentos e configure PIN, senha ou padrão seguro. Ative a sessão pelo app visível e conceda as permissões necessárias.
2. Na área reservada, leia a explicação da escuta local. Escolha uma frase que seja fácil de lembrar e incomum nas conversas habituais. O catálogo limita as opções às frases suportadas por esta versão.
3. Confirme o consentimento específico para o **treino de voz**. Treinar não habilita pedidos reais. O treino ouve o microfone localmente, mas não cria ocorrência nem transmite áudio/localização.
4. Bloqueie o aparelho, deixe o Lume em segundo plano e fale a frase inteira. Faça uma pausa de **1–2 segundos** e repita a mesma frase inteira. Deixe silêncio depois de cada enunciação para que o reconhecedor finalize a fala.
5. Desbloqueie normalmente, volte à área reservada e confira o resultado. O treino só aprova quando a tentativa válida foi realizada sob bloqueio seguro; uma aprovação não é garantia acústica para outro ambiente.
6. Após o treino aprovado, leia e confirme a opção distinta de **habilitar acionamentos reais por voz**. A escuta real precisa ser iniciada com a tela do aplicativo visível. Confira o estado de prontidão antes de bloquear novamente.

Para pedir apoio no modo real, fale a mesma frase completa duas vezes, separadas pela pausa de 1–2 segundos treinada com a equipe. Uma única ocorrência da frase, partes da frase ou uma fala ainda parcial não confirmam o pedido. Não é necessário acender a tela para a entrada de áudio; a sessão de microfone precisa continuar ativa. O procedimento de acender a tela antes da sequência de volume continua específico do [atalho físico](physical-trigger.md).

| Opção | Frase a repetir inteira |
| --- | --- |
| Estrela azul | minha estrela azul |
| Jardim de luz | o jardim precisa de luz |
| Janela da lua | a janela da lua |

O reconhecimento local pode acontecer sem internet. A central só recebe quando houver conexão e confirmação técnica da API. Estar pronto para ouvir, reconhecer a frase, receber o pedido no servidor e ter atendimento humano são estados diferentes.

## Regras contra acionamento acidental

`VoicePhrasePolicy` recebe somente resultados finais do reconhecedor, com palavras, confiança e tempos. A decodificação usa o vocabulário completo do modelo português, em vez de forçar qualquer som a uma gramática contendo apenas a frase. Resultados parciais nunca disparam.

| Verificação | Regra |
| --- | --- |
| Frase | Todas as palavras da opção escolhida, na ordem exata, após normalização de caixa/espaços/acentos; sem palavras extras. |
| Confiança | Cada palavra precisa ter confiança finita de pelo menos 0,85. O número é um filtro do modelo, não uma probabilidade de segurança ou identificação da pessoa. |
| Duração | Cada enunciação dura de 0,8 a 6s. Cada palavra dura de 40ms a 1,8s; os intervalos internos são de até 1s. |
| Confirmação | Duas enunciações finais independentes; a segunda começa pelo menos 400ms depois do fim da primeira e termina em até 12s após aquele fim. |
| Resultado recente | Atraso máximo de 3s entre fim da fala capturada e processamento do resultado. Resultado antigo, sobreposto ou repetido não serve como segunda confirmação. |
| Outra fala | Fala não vazia que não satisfaça a frase/regras descarta a primeira confirmação pendente. |
| Depois do pedido | Intervalo de 30s entre confirmações; a escuta real é encerrada ao confirmar um pedido, antes da gravação de áudio da ocorrência. |

Os tempos de fala vêm da linha do tempo das amostras PCM, com relógio monotônico; não dependem do relógio civil. Reiniciar/cancelar a escuta descarta resultados e confirmações pendentes. Callbacks de uma geração ou vínculo anterior não podem confirmar pedidos na sessão atual.

As regras reduzem acionamentos casuais, mas **não garantem ausência de falsos positivos ou de falhas de detecção**. Não há identificação biométrica de locutor. Outra pessoa, TV, rádio ou uma gravação reproduzindo a frase completa duas vezes pode acionar. Volume baixo, ruído, sotaque, distância, tecido do bolso e dificuldade de fala podem impedir a detecção. A equipe precisa testar essas situações e manter uma alternativa treinada.

## Microfone, bloqueio e interrupções

A sessão usa um foreground service de microfone iniciado a partir de uma Activity visível. Depois de iniciada, pode continuar com keyguard e outra aplicação aberta. O aplicativo não tenta iniciar clandestinamente o microfone após reinício, encerramento do processo ou com uma mensagem remota. A [restrição Android para permissões durante o uso](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start) exige esse cuidado ao criar serviços de microfone; a [declaração do tipo de serviço](https://developer.android.com/develop/background-work/services/fgs/service-types#microphone) não equivale a uma concessão permanente.

O estado habilitado não prova entrada de áudio utilizável. Falha no gravador, permissão revogada ou silenciamento conhecido pelo Android retiram a prontidão e interrompem a tentativa. Ao resolver a condição, reabra o app e habilite explicitamente a escuta; a mudança não deve restaurar silenciosamente pedidos reais. Interromper a voz, pausar a sessão, interromper compartilhamento, revogar/trocar o vínculo ou destruir o serviço descarta a escuta e seus resultados pendentes. A aprovação do treino fica vinculada ao aparelho, frase e ambiente da sessão; siga a indicação de novo treino exibida pelo app.

`voiceEnabled` representa a habilitação real desta sessão, `voiceListening` indica a captura local iniciada e `voiceReady` exige também treino válido, permissões, vínculo, sessão elegível e ausência de cooldown. `voiceConfirmationPending` informa que a primeira frase válida aguarda repetição. Nenhum desses estados confirma recebimento pela central. O modo real não é restaurado após morte do processo, e concluir um pedido encerra a escuta; para usar voz novamente, retome a configuração visível indicada pelo app.

Chamadas e outros aplicativos podem tomar a entrada de áudio. Fones com fio/Bluetooth podem mudar a rota do microfone. O [compartilhamento de entrada de áudio no Android](https://developer.android.com/media/platform/sharing-audio-input) prevê prioridades, silêncio e mudanças de configuração; o callback de gravação informa condições conhecidas, mas não comprova que o som está claro ou que a frase será reconhecida. Não grave chamadas como substituto dessa funcionalidade.

O Android pode mostrar o uso de microfone no painel de privacidade e na barra de status. Desligar o acesso global ao microfone pode fornecer silêncio mesmo com permissão concedida. Esses controles são da assistida e permanecem disponíveis. Veja [indicadores e controles de privacidade](https://developer.android.com/training/permissions/explaining-access).

Economia de bateria, Doze e políticas do fabricante podem afetar processamento, continuidade e envio. Wake lock e serviço em primeiro plano não certificam funcionamento em qualquer estado. A [documentação de Doze](https://developer.android.com/training/monitoring-device-state/doze-standby) descreve adiamentos de CPU/rede e a necessidade de teste. Não há medida de consumo físico ou autonomia certificada nesta entrega.

## Modelo e distribuição

O reconhecimento usa Vosk e o modelo `vosk-model-small-pt-0.3`, disponibilizado para aplicações móveis em português sob Apache 2.0 no [catálogo oficial](https://alphacephei.com/vosk/models). O modelo é incluído no pacote e extraído para armazenamento privado, com verificação de integridade; a ativação não depende de baixar arquivos ou contatar um serviço de reconhecimento.

O ZIP oficial usado nesta versão tem SHA-256 `6e1ce909032e1afa7a88e68a3d628ecafff302bdf195befab308826c395e93b7`. Todas as palavras das três frases foram conferidas no vocabulário desse modelo. Isso verifica disponibilidade no dicionário, não qualidade de reconhecimento acústico.

O catálogo publica medidas de erro de transcrição para corpus próprios; esses números não medem falsos acionamentos do Lume e não certificam vocabulário, voz ou ambiente da assistida. O treino local verifica a frase no ambiente ensaiado, sem ajustar um modelo biométrico.

A [API oficial de Recognizer](https://github.com/alphacep/vosk-api/blob/master/java/lib/src/main/java/org/vosk/Recognizer.java) suporta áudio PCM mono de 16 bits, resultados finais, palavras/confianças e tempos. O aplicativo fornece áudio a 16kHz e descarta buffers e texto após o processamento. A opção de `android.speech.SpeechRecognizer` não é usada: sua [documentação](https://developer.android.com/reference/android/speech/SpeechRecognizer) informa limitações de uso contínuo e possíveis serviços remotos. As versões e licenças empacotadas devem permanecer registradas junto aos artefatos de terceiros.

## Homologação e evidências

As verificações automatizadas devem separar três camadas:

- Política pura: resultados finais, limites de confiança/duração, frase incompleta, palavras extras, replay, falas sobrepostas, resultado antigo, expiração e cooldown, sem depender de microfone ou rede.
- Integração Android: permissão/consentimento, início visível do serviço, treino sem ocorrência, callbacks descartados depois de parar/trocar identidade, transição da escuta para gravação AAC e pedido rotulado como voz na API demo.
- Acústica em aparelho físico: voz da assistida, fala comum, TV/rádio, silêncio/ruído, bolso/capinha, distância, chamada, Bluetooth, microfone global, tela apagada, economia de bateria e uso prolongado sob bloqueio.

Alimentar PCM de teste ao reconhecedor verifica a decodificação; chamar a política com um JSON pronto verifica somente a política. Nenhum dos dois demonstra captação pelo microfone físico. Injeção de áudio em emulador não homologa microfone, autonomia ou políticas de fabricantes. Registre a origem do áudio em cada evidência e não descreva resultados de política como teste acústico real.

A matriz de aparelhos/cenários está em [acceptance.md](acceptance.md). Resultados efetivamente executados e limitações da entrega ficam em [validation.md](validation.md). Use somente identidade e central de demonstração nos ensaios; não gere pedidos operacionais para testar a frase.
