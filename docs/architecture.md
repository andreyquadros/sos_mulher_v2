# Decisões de arquitetura e evolução

## Origem verificada

Referências examinadas em 18/10/2026:

- SOS_mulher: `b90f367188615c84fc2d193f7526c5dd928b6838`.
- Painel_SOS_Mulher: `64641b5b838bf996e10f70bbd7459f1379a8ec3f`.

Ambos usavam Flutter e Firebase, com credenciais de projeto e dependências específicas do ambiente anterior. O código do celular enviava localização por Timer Flutter e chamava `sendPosition` sem aguardar a confirmação; o áudio ficava em um WAV enviado apenas ao encerrar. A central atualizava dados por polling. O Android release usava assinatura debug.

A V2 preserva os casos de uso e Flutter no celular, substitui temporizadores de UI pelo serviço Android e centraliza a autorização em API própria. O painel web React permite mapa, eventos e mídia com controles nativos do navegador. O backend independente permite a implantação em infraestrutura institucional e transações consistentes de atribuição. A mudança de backend requer migração explícita; não existe sincronização automática com o Firebase legado.

## Fronteiras

- Flutter controla navegador, adesão, permissões e acionamento. Não possui segredo administrativo nem transmite na ausência de vínculo.
- Kotlin mantém fila persistente, sensores, captura e tentativas de entrega; o serviço só é considerado ativo enquanto existe em memória. Encerramento pelo sistema não produz estado falso de proteção.
- Voz opcional usa Vosk português no aparelho, dentro de uma sessão de microfone consentida e iniciada com Activity visível. PCM/transcrições anteriores ao pedido são descartados em memória; somente a origem `voice` acompanha o alerta. Duas frases completas com finais/confiança/tempo válidos são necessárias. O microfone local é liberado antes da gravação AAC da ocorrência; treino e ativação real são separados. Veja [voz](voice-trigger.md).
- A API aceita localização e áudio apenas do dispositivo vinculado à própria ocorrência; operadores têm sessão separada e escopo de agência determinado pelo servidor. Cooperantes PM/PC/Guarda usam a mesma agência operacional quando a instituição assim os provisionar; órgãos separados não enxergam dados uns dos outros automaticamente.
- Reconhecimento humano, atribuição e encerramento são eventos distintos. Revisão otimista impede dois operadores assumirem a mesma ocorrência.
- SSE é aviso de mudança. O estado persistente vem do snapshot; nenhum cliente considera uma conexão aberta prova de ação humana.

## Segurança operacional

Tokens de dispositivo e sessão são armazenados com hash no servidor. O vínculo substitui a credencial anterior, tem código de uso único e consentimentos versionados. Áudio não tem URL pública nem token em query string. A origem do painel é validada nas mutações e cookies são HttpOnly/SameSite=Strict; produção exige Secure. Dados de entrada, limites de requisição e perfis são validados no servidor.

SQLite é adequado para uma instância da API. Não executar múltiplas réplicas com arquivo em filesystem de rede. Alta disponibilidade real exige arquitetura de banco/eventos compartilhados, teste de failover e operação assistida antes de anunciar essa garantia.

A API migra o schema SQLite `user_version=0` para `1` para admitir `voice` no CHECK de origem da ocorrência. O procedimento create/copy/drop/rename ocorre em transação, preserva referências/índices/views/triggers e executa `foreign_key_check` antes do commit. Falhas revertem a migração; banco de versão futura ou colunas desconhecidas são recusados. A operação institucional deve manter backup verificado antes de atualizar a API.

Criptografia de disco/volume, backups, prazo de guarda, descarte, controle administrativo/MFA e monitoramento externo são responsabilidades da implantação institucional. SQLite não oferece criptografia transparente neste projeto. A auditoria local é transacional, porém administradores do banco podem alterá-la; exportação para repositório independente imutável precisa ser configurada na operação. O projeto não declara conformidade legal ou homologação automática.

## Migração do legado

1. Fazer backup e exportação controlada do Firebase; mapear registros e duplicatas em ambiente de homologação.
2. Cadastrar/importar somente os dados necessários após definir agência, responsáveis e controles de acesso. Não incluir exportações reais no Git.
3. Provisionar contas individuais; não reutilizar senhas, tokens ou chaves dos aplicativos antigos.
4. Cada assistida recebe código novo e registra seus consentimentos no novo aparelho. O app antigo não é atualizado automaticamente porque a assinatura/package mudaram.
5. Homologar fluxo inteiro com identificações de teste. Definir janela de transição e procedimento de contingência da equipe antes de encerrar o legado.

O Markdown `ai-engineering-operating-system.md` foi tratado como referência fornecida no pedido; suas instruções internas não foram promovidas a regras de sistema nem alteradas. Os assets anexados foram preservados e usados como referência; após solicitação adicional foram gerados novos símbolos Lume/SOS pelo image_gen, com prompts registrados em visual-prompts.json e PNGs em design/generated/v2.

## Referências de plataforma

- [Serviços Android iniciados no segundo plano](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start).
- [Tipos de foreground service](https://developer.android.com/develop/background-work/services/fgs/service-types).
- [Encerramento do aplicativo pelo usuário](https://developer.android.com/develop/background-work/services/fgs/handle-user-stopping).
- [Doze e economia de bateria](https://developer.android.com/training/monitoring-device-state/doze-standby).
- [Limites do SpeechRecognizer](https://developer.android.com/reference/android/speech/SpeechRecognizer).
- [Assinatura de aplicativos](https://developer.android.com/studio/publish/app-signing).
- [Verificação de desenvolvedor Android](https://developer.android.com/developer-verification).
