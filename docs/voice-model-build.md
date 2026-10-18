# Modelo de reconhecimento de voz no build

Antes do primeiro build Android, na raiz do repositório:

```sh
node scripts/prepare-voice-model.mjs
```

O script exige Node 22.13+ e usa somente bibliotecas padrão. Baixa por HTTPS o modelo oficial `vosk-model-small-pt-0.3` (cerca de 31 MiB), verifica o SHA256 fixado `6e1ce909032e1afa7a88e68a3d628ecafff302bdf195befab308826c395e93b7` e extrai apenas os 14 arquivos esperados, com limites de tamanho e proteção contra caminhos externos/links. Em execuções seguintes verifica os hashes dos arquivos locais e reutiliza o modelo. A CI faz essa preparação antes do APK. Um arquivo ZIP previamente obtido também pode ser verificado e preparado com `--archive /caminho/vosk-model-small-pt-0.3.zip`.

Os aproximadamente 51 MiB expandidos ficam em `apps/mobile/android/app/src/main/assets/voice-model-pt`, ignorado pelo Git, e entram no APK. O Gradle recusa um build Android sem o manifesto do modelo fixado. O aparelho instala uma cópia privada em `noBackupFilesDir` após verificar os hashes de cada arquivo, fora da thread principal; nenhum modelo é baixado pelo aplicativo. A UI somente informa que a escuta está pronta depois de carregar o modelo e iniciar o microfone.

Dependências fixadas: `com.alphacephei:vosk-android:0.3.75` e `net.java.dev.jna:jna:5.18.1@aar`, do Maven Central. O modelo e Vosk têm licença Apache 2.0; a licença e os créditos seguem no APK em `assets/licenses/`. JNA é usado pela opção Apache 2.0 de sua licença dupla. Consulte a [lista oficial de modelos](https://alphacephei.com/vosk/models), o [código Vosk](https://github.com/alphacep/vosk-api) e o [JNA](https://github.com/java-native-access/jna).

O release com R8 preserva os símbolos JNA/Vosk usados por reflexão/registro nativo em `android/app/proguard-rules.pro`, seguindo o [exemplo oficial](https://github.com/alphacep/vosk-android-demo/blob/master/app/proguard-rules.pro). A configuração de release continua exigindo chave institucional externa; não foi gerado um release assinado nesta entrega.

O modelo pequeno possui limitações de reconhecimento, sobretudo em ruído e com variações de voz. A confiança do reconhecedor não identifica a pessoa que falou. O treino precisa passar no aparelho da usuária antes da ativação real e a homologação deve medir o comportamento com vozes locais, televisão, gravações e ruído. O vocabulário completo é preservado: não se restringe a gramática às frases de acionamento.

## Fixtures do reconhecedor

`androidTest/assets/voice-fixtures` contém somente três WAV de fala sintética criada localmente com `say -v Luciana -r 150` (português brasileiro), convertida pelo FFmpeg para PCM assinado de 16 bits, mono, 16 kHz. As frases genéricas, procedência, quantidade de amostras e hashes estão no manifesto do diretório. Não há fala de participantes, vítimas ou terceiros. As três gravações estão apenas no APK de testes, nunca no aplicativo normal:

- `estrela-twice.wav`: meia segunda inicial, “minha estrela azul”, pausa de 2 segundos, a mesma frase e 2 segundos finais.
- `estrela-single.wav`: meia segunda inicial, uma frase e 2 segundos finais.
- `near-and-unrelated.wav`: “minha estrela amarela” e “bom dia, hoje vamos visitar a escola”, separadas por 2 segundos.

`VoiceRecognitionTest` processa esses arquivos com o reconhecedor nativo real, modelo completo e endpoints finais, verificando a política de duas frases. Esse teste não usa microfone, API ou disparos. Complementa os testes de políticas e de ciclo de vida do microfone com tela bloqueada; não mede qualidade acústica ou confiabilidade em aparelhos físicos.
