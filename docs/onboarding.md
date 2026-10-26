# Guias de proteção e da central

## Celular: três acessos à área reservada

O guia de proteção aparece automaticamente nos três primeiros acessos autenticados à área reservada em que não há uma ocorrência em andamento. Abrir o navegador, cancelar a autenticação ou atualizar os estados não consome uma apresentação. Cada nova entrada autenticada, inclusive ao voltar das configurações do Android, é um novo acesso; as páginas de um mesmo guia não contam como acessos separados.

O contador fica no armazenamento privado do Android, separado do vínculo e da fila de alertas. Ele sobrevive a reinicializações e atualizações do APK e não é zerado por um novo pareamento. Após a terceira apresentação, o botão **Guia de proteção** continua disponível. Consultá-lo manualmente não incrementa o contador.

As cinco etapas apresentam autonomia e privacidade, vínculo e permissões, botão flutuante com pressão de 5 segundos, limites de uso e confirmações de uma ocorrência. Voz e volume ficam como opções adicionais na área reservada. As etapas explicam treino e ativação real como decisões diferentes e deixam claro que a sobreposição exige tela desbloqueada. O guia é silencioso e ilustrativo: não concede permissões, não ativa o serviço, não habilita atalhos, não abre o microfone e não envia alertas.

O guia pode ser fechado imediatamente. Sair do aplicativo ou bloquear a tela fecha tanto o guia quanto a área reservada. Uma nova ocorrência tem prioridade sobre a apresentação automática; uma resposta tardia do contador não pode reabrir conteúdo privado após a saída.

## Painel: primeiro acesso de cada operador

Após a autenticação, o painel consulta a conclusão do guia da central para aquela conta. A conclusão ou dispensa é salva na API, vinculada ao operador e à versão do guia, e permanece entre sessões e dispositivos. Não depende de um marcador compartilhado no navegador. Todos os perfis podem dispensar o próprio guia, inclusive o perfil de consulta, sem receber novas permissões operacionais.

O conteúdo explica o preparo de som e notificações, leitura e reconhecimento de alertas, atribuição de responsável, localização e precisão, acesso privado ao áudio, vínculo consentido e encerramento. O guia diferencia recebimento técnico de atendimento humano e preserva as restrições de cada perfil.

O acesso aos alertas permanece prioritário. A apresentação automática aguarda a sincronização da conta e uma fila sem ocorrências abertas; enquanto houver atendimento, o painel mantém um aviso discreto e o botão **Guia da central** para consulta manual. Novos alertas fecham o guia sem registrá-lo como concluído. O guia não ativa som, notificações ou reprodução de áudio automaticamente. Falha ao salvar a conclusão não é apresentada como sucesso.

## Movimento e validação

As animações usam a identidade SOS Mulher existente e ajudam a acompanhar entradas, etapas e exemplos. O app respeita `MediaQuery.disableAnimations`; o painel respeita `prefers-reduced-motion`. Textos, sequência e estados permanecem disponíveis sem animação.

A validação cobre limite e persistência das três apresentações, autenticação e ciclo de vida, consulta manual, prioridade de ocorrências, isolamento por operador e gravação após nova sessão. Esses testes de interface não substituem o treino dos acionamentos no próprio aparelho nem a homologação de bateria, teclas e reconhecimento acústico.
