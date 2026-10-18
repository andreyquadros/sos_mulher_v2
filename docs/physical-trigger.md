# Atalho físico opcional

O Lume oferece uma sequência deliberada de volume para pedir apoio com outro app aberto ou sob keyguard, quando o Android entrega essas teclas. A assistida decide usar o recurso, habilita o serviço nas configurações do sistema, treina no próprio aparelho e confirma separadamente o modo real. A implementação não oferece garantia universal de funcionamento com tela apagada ou em todos os fabricantes.

Escolhemos a opção física do requisito de acionamento por botões **ou** palavra-chave. Não há escuta contínua, reconhecimento de palavra-chave nem microfone aberto antes de uma ocorrência. O treino físico é local: não cria ocorrência, não transmite localização/áudio e não inicia sensores.

## Sequência

| Ação | Regra |
| --- | --- |
| 1 | Pressionar e soltar BAIXAR volume, em até 1s. |
| 2 | Pressionar e soltar SUBIR volume, em até 1s. |
| 3 | Pressionar e soltar BAIXAR volume, em até 1s. |
| 4 | Pressionar SUBIR, manter de 2s a 4s e **soltar**. |

O intervalo entre ações é de até 1,5s e a sequência inteira termina em até 10s. Só o release final pode disparar. Depois de um acionamento há cooldown de 30s. Repetição automática não conta como clique; teclas simultâneas, ordem incorreta, duração excessiva, timeout, evento cancelado e replay de `downTime` descartam a tentativa. Solte todas as teclas antes de reiniciar.

O antigo chord simultâneo de dois volumes por 3s foi removido. A pressão de 3s nos controles da interface e na confirmação da notificação continua sendo um acionamento separado.

O serviço devolve `false` aos eventos e preserva o volume normal do aparelho. Portanto, segurar SUBIR também pode elevar o volume de mídia/chamada. A equipe deve ensaiar ergonomia e discrição com a assistida no aparelho real, incluindo capinha e uso habitual; não tratar o padrão como infalível contra toque acidental.

## Ativação e treino

1. Com a equipe, vincule o aparelho à central, escolha os consentimentos, configure bloqueio seguro e ative a sessão de sensores com o app visível.
2. Na área reservada, leia o escopo do atalho e confirme que deseja abrir as configurações Android. Habilite ali o serviço de volume do Lume. O aplicativo não concede essa autorização sozinho.
3. Inicie o treino. Há uma janela de **90s** para realizar a sequência com bloqueio seguro mantido durante todas as ações.
4. Bloqueie o aparelho. Se a tela estiver apagada, acenda-a com um toque curto em liga/desliga, **sem desbloquear**. Faça a sequência de volume.
5. Volte à área reservada pelo desbloqueio normal e confira o resultado. Uma sequência realizada com o aparelho desbloqueado não produz prova válida. O treino não envia pedido, mesmo quando concluído corretamente.
6. Após treino aprovado, leia e confirme a opção de **habilitar acionamentos reais**. Essa confirmação é distinta de habilitar acessibilidade e de treinar.

Não habilite o modo real enquanto houver conflito indicado com outro serviço que solicita filtro de teclas. Se o Android ou fabricante não entregar o padrão de forma confiável, use o método de notificação/bloco rápido treinado com a equipe.

A prova de treino pertence ao vínculo e ao ambiente do aparelho. Reboot, mudança da identificação do sistema e novo pareamento invalidam essa prova; refaça o treino e a ativação. Desativar o recurso ou pausar a sessão por `disarm()` interrompe o atalho. Reativar a sessão de sensores não substitui a habilitação explícita do atalho.

## Escopo de acesso

`PhysicalTriggerService` é um `AccessibilityService` opcional com `canRequestFilterKeyEvents=true` e `FLAG_REQUEST_FILTER_KEY_EVENTS`. A configuração mantém `canRetrieveWindowContent=false` e `isAccessibilityTool=false`, sem capacidade de gestos ou screenshot. Não solicita conteúdo de janelas, não examina eventos de tela e só usa volume para a máquina local. O Android pode apresentar seus avisos de privacidade; eles permanecem disponíveis à assistida. A finalidade e as capacidades são distintas na [referência oficial de AccessibilityServiceInfo](https://developer.android.com/reference/android/accessibilityservice/AccessibilityServiceInfo).

O callback observa a cópia dos eventos que o sistema fornece. Devolver `false` mantém o fluxo normal para os demais componentes; essa observação não obriga o Android a entregar eventos em qualquer condição. Veja [AccessibilityService.onKeyEvent](https://developer.android.com/reference/android/accessibilityservice/AccessibilityService#onKeyEvent(android.view.KeyEvent)).

Tela totalmente apagada não é equivalente a keyguard com tela acesa. A política AOSP contém caminhos que não encaminham teclas ao usuário quando a tela está desligada; por isso o procedimento orienta acender a tela primeiro. Isso é uma limitação de plataforma, e fabricantes podem acrescentar outras. Referência: [PhoneWindowManager — política de entrada não interativa](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/services/core/java/com/android/server/policy/PhoneWindowManager.java), métodos `interceptKeyBeforeQueueing` e `shouldDispatchInputWhenNonInteractive`.

Chamadas telefônicas, outros serviços de acessibilidade com filtro de teclas, políticas de bateria e alterações do fabricante precisam ser ensaiados separadamente. Uma confirmação em emulador ou treino anterior não constitui garantia para outro aparelho ou ambiente.

## Sessão, alerta e interrupções

`physicalEnabled` significa que a assistida habilitou o recurso. `physicalReady` exige também conexão do serviço, prova válida e sessão de sensores pronta. Esses estados não comprovam rede, recebimento pela central ou atendimento humano.

Se o foreground service morrer, `physicalReady` fica falso. Com serviço de acessibilidade conectado, prova ainda válida e habilitação preservada, uma nova sequência pode salvar um alerta na fila cifrada, mesmo sem sensores. Essa rota não inicia foreground service em segundo plano; a interface orienta reabrir o app e retomar a sessão visivelmente. Localização e áudio dependem de sessão já existente e das permissões/consentimentos correspondentes. As [restrições oficiais de início de foreground service](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start) continuam aplicáveis.

Sem resposta do servidor, o estado permanece pendente. Reconhecimento humano e atribuição continuam separados. Revogação ou troca do vínculo desabilitam a identidade anterior; fila e prova antigas não podem ser reaproveitadas por outro pareamento. Interromper compartilhamento para novas capturas mantém a ocorrência da central aberta; pausar a sessão por `disarm()` desabilita também o atalho.

## Ensaios automatizados e de campo

Foram aprovados **25 testes JVM**: seis políticas gerais e dezenove testes da sequência, incluindo bordas exatas, autorepeat, reset/cooldown, replay, duplo relógio e expiração após deep sleep, além de 2.000 ações pseudoaleatórias sem alerta. A máquina é pura, sem dependência de Android; esses testes verificam reconhecimento e não entrega física de teclas.

Também foram aprovados **19 testes Flutter**, incluindo consentimento explícito, bloqueio de prontidão sem prova/conexão, conflito de acessibilidade, treino sem ativação automática e fechamento da área reservada com diálogo aberto ao sair para segundo plano.

A instrumentação `PhysicalTriggerDeviceTest` foi **aprovada: 1/1 AndroidJUnit** em AVD Pixel 3a, Android 14/API34, com quatro vCPUs, execução sem janela e inicialização a frio. Na execução registrada, o Gradle concluiu em **1min22s** e o caso instrumental durou aproximadamente **34s**. Esses tempos descrevem esse ambiente, não uma garantia de duração.

O ensaio confirmou:

- Treino com o aparelho desbloqueado não aprova a prova obrigatória; pressão final curta de 600ms também é rejeitada.
- A sequência válida com keyguard seguro aprova o treino sem criar ocorrência.
- Após habilitação real explícita, a sequência com o app em segundo plano e o aparelho bloqueado produz um alerta, com confirmação técnica da API, localização do emulador e blocos AAC recebidos.
- Depois de `stopSharing()`, repetir imediatamente a sequência durante o cooldown não retoma a captura.

A API estava em `DEMO_MODE=true`: **todas as ocorrências do ensaio foram simuladas**. O microfone do host permaneceu desativado. Os blocos AAC comprovam o caminho de gravação/entrega nesse ambiente; não comprovam captação acústica física, qualidade do som ou comportamento do microfone de um telefone real. A confirmação técnica da API não equivale a reconhecimento humano ou despacho.

A tentativa anterior com `UiAutomation.injectInputEvent` não entregou as teclas ao filtro global. O `event send` do console do emulador antigo também respondeu `OK`, mas `getevent` não observou eventos. Isso identificou uma limitação da injeção do harness, não uma falha comprovada do callback produtivo. O procedimento aprovado usa entrada bruta no kernel com `sendevent`, percorrendo o InputReader e o filtro normal de acessibilidade, sem chamar o callback de produção diretamente.

As evidências estão em [validation.md](validation.md); a matriz de campo permanece em [acceptance.md](acceptance.md). O resultado aprova essa integração no AVD ensaiado. Não certifica botões físicos, bateria, chamadas ou políticas de Samsung, Motorola ou outros fabricantes.

### Ensaio instrumental isolado

Pré-requisitos: deixe conectado **exatamente um emulador descartável e isolado**, com imagem Google APIs compatível com `adb root`, inicialmente sem PIN, senha ou padrão de bloqueio, sem contas ou dados reais e com localização fictícia. Mantenha a API local em `DEMO_MODE=true` e o microfone do host desativado. Não execute em aparelho pessoal ou institucional em uso: o AndroidJUnit configura e remove um PIN próprio durante o ensaio.

Com a demonstração ativa, no root do repositório:

```sh
npm run test:android:physical
```

O driver Node prepara a fixture privada de vínculo de uma assistida fictícia com permissão `0600`, verifica o ambiente demo e coordena a instrumentação. Ele usa `adb root` **somente no AVD isolado de teste**, descobre automaticamente o nó `/dev/input/event*` do teclado nomeado pelo emulador e injeta `sendevent` com `EV_KEY` — 114/`KEY_VOLUMEDOWN` e 115/`KEY_VOLUMEUP` — seguido de `EV_SYN`/`SYN_REPORT`. Assim, os eventos percorrem o kernel e o InputReader antes do serviço de acessibilidade.

O root pertence ao daemon ADB do emulador de ensaio: **o APK continua executando com UID normal e não exige root em produção**. O driver restaura o daemon com `adb unroot` ao encerrar. As flags do harness servem à preparação e à sincronização; não chamam `onKeyEvent` nem substituem o reconhecimento por uma invocação direta. O código produtivo não recebe permissões root ou um caminho alternativo para fingir teclas.

O AndroidJUnit verifica keyguard seguro, treino local, habilitação explícita, acionamento e a integração com localização e AAC no ambiente demo. As fixtures ficam ignoradas pelo Git e contêm código efêmero de vínculo, válido por dez minutos. Não copie seu conteúdo para documentação, logs ou APK de distribuição. Não faça a cópia manual dos assets nem execute `connectedDebugAndroidTest` como substituto do driver: a preparação e a injeção de kernel fazem parte deste ensaio.

Após o ensaio, confira a remoção das fixtures privadas, inclusive eventual cópia em `apps/mobile/android/app/src/androidTest/assets/physical-e2e.json`, a restauração com `adb unroot` e a remoção do PIN de teste. Reconstrua o APK normal para avaliação; o APK de instrumentação e suas credenciais não são artefatos de distribuição. O resultado em AVD não substitui a homologação de teclas físicas, tela bloqueada, bateria e serviços de acessibilidade nos aparelhos de uso real.
